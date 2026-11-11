import "server-only";
import { getAIProvider } from "@/lib/ai";
import { runWithAiContext } from "@/lib/ai/metering";
import type { AIProvider, BrandContext, SourceMaterial } from "@/lib/ai/types";
import { logAgentAction, logSystemAction, type AuditEntry } from "@/lib/audit";
import { fromJson, toJson } from "@/lib/json";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Agent, AgentKind, Organization, RunStep, SourceKind, SourceMessage, TermRule } from "@/lib/types";
import { TOOL_MAP, type ToolKey } from "@/lib/agents/registry";

export class AgentPermissionError extends Error {
  constructor(agentName: string, tool: string) {
    super(`${agentName} heeft geen toestemming voor de tool “${TOOL_MAP[tool as ToolKey]?.label ?? tool}”.`);
    this.name = "AgentPermissionError";
  }
}

export class AgentPausedError extends Error {
  constructor(agentName: string) {
    super(`${agentName} is gepauzeerd. Activeer de agent om deze taak uit te voeren.`);
    this.name = "AgentPausedError";
  }
}

export type RunOptions = {
  organizationId: string;
  /** null runs as the shared intelligence engine (no agent identity). */
  agentKind: AgentKind | null;
  pipeline: string;
  trigger: "manual" | "schedule" | "event" | "demo";
  triggeredBy?: string | null;
  input?: Record<string, unknown>;
};

/**
 * Execution context for one agent run.
 *
 * - Scopes all data access to a single organization.
 * - Enforces the agent's tool allow-list and source allow-list.
 * - Records every step in agent_runs and the shared activity log.
 *
 * It uses the service-role client because agents also run in background jobs
 * without a user session; the scoping above is what keeps an agent from
 * reaching data it is not authorized for.
 */
export class AgentRuntime {
  readonly db: AdminClient;
  readonly ai: AIProvider;
  private steps: RunStep[] = [];
  private brandCache: BrandContext | null = null;

  private constructor(
    readonly organization: Organization,
    readonly agent: Agent | null,
    readonly runId: string,
    readonly options: RunOptions,
  ) {
    this.db = createAdminClient();
    this.ai = getAIProvider();
  }

  static async start(options: RunOptions): Promise<AgentRuntime> {
    const db = createAdminClient();
    const { data: organization, error: orgError } = await db
      .from("organizations")
      .select("*")
      .eq("id", options.organizationId)
      .single();
    if (orgError || !organization) throw new Error("Organisatie niet gevonden.");

    let agent: Agent | null = null;
    if (options.agentKind) {
      const { data, error } = await db
        .from("agents")
        .select("*")
        .eq("organization_id", options.organizationId)
        .eq("kind", options.agentKind)
        .single();
      if (error || !data) throw new Error("Agent niet gevonden.");
      agent = data;
      if (agent.status !== "active") throw new AgentPausedError(agent.name);
    }

    const { data: run, error: runError } = await db
      .from("agent_runs")
      .insert({
        organization_id: options.organizationId,
        agent_id: agent?.id ?? null,
        pipeline: options.pipeline,
        trigger: options.trigger,
        triggered_by: options.triggeredBy ?? null,
        input: toJson(options.input ?? {}),
        ai_provider: getAIProvider().id,
      })
      .select("id")
      .single();
    if (runError || !run) throw new Error(`Run kon niet worden gestart: ${runError?.message}`);

    return new AgentRuntime(organization, agent, run.id, options);
  }

  get orgId(): string {
    return this.organization.id;
  }

  get actorName(): string {
    return this.agent?.name ?? "Intelligence Engine";
  }

  /** Asserts the agent may use a tool. The shared engine only detects/enriches. */
  use(tool: ToolKey): void {
    if (!this.agent) {
      if (!["read_sources", "detect_signals", "enrich_context"].includes(tool)) {
        throw new AgentPermissionError("De Intelligence Engine", tool);
      }
      return;
    }
    if (!this.agent.allowed_tools.includes(tool)) {
      throw new AgentPermissionError(this.agent.name, tool);
    }
  }

  canUse(tool: ToolKey): boolean {
    return this.agent ? this.agent.allowed_tools.includes(tool) : false;
  }

  step(key: string, label: string, detail?: string, tool?: ToolKey, status: RunStep["status"] = "completed"): void {
    this.steps.push({ key, label, detail, tool, status, at: new Date().toISOString() });
  }

  /** Writes to the shared activity log as this agent (or as the system). */
  async log(entry: Omit<AuditEntry, "organizationId">): Promise<void> {
    const full = {
      ...entry,
      organizationId: this.orgId,
      metadata: { ...(entry.metadata ?? {}), run_id: this.runId, ai_provider: this.ai.id },
    };
    if (this.agent) await logAgentAction(this.db, this.agent.id, full);
    else await logSystemAction(this.db, full);
  }

  /** Which source systems this run may read. */
  get allowedSources(): SourceKind[] {
    if (!this.agent) return ["slack", "jira", "teamleader", "email", "manual"];
    return this.agent.allowed_sources as SourceKind[];
  }

  /** Loads source messages by id, restricted to this org and allowed sources. */
  async readSources(ids: string[]): Promise<SourceMaterial[]> {
    this.use("read_sources");
    if (ids.length === 0) return [];
    const { data, error } = await this.db
      .from("source_messages")
      .select("*")
      .eq("organization_id", this.orgId)
      .in("id", ids)
      .in("source", this.allowedSources)
      .order("occurred_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toSourceMaterial);
  }

  /** Source messages linked to a signal (primary + related), filtered by allow-list. */
  async readSignalSources(signalId: string): Promise<SourceMaterial[]> {
    const { data, error } = await this.db
      .from("signal_sources")
      .select("source_message_id")
      .eq("organization_id", this.orgId)
      .eq("signal_id", signalId);
    if (error) throw new Error(error.message);
    return this.readSources((data ?? []).map((r) => r.source_message_id));
  }

  async brand(): Promise<BrandContext> {
    if (!this.brandCache) this.brandCache = await loadBrandContext(this.db, this.organization);
    return this.brandCache;
  }

  async finish(output: Record<string, unknown> = {}, status: "completed" | "waiting_approval" = "completed") {
    await this.db
      .from("agent_runs")
      .update({
        status,
        output: toJson(output),
        steps: toJson(this.steps),
        finished_at: new Date().toISOString(),
      })
      .eq("id", this.runId);
    if (this.agent) {
      await this.db.from("agents").update({ last_run_at: new Date().toISOString() }).eq("id", this.agent.id);
    }
  }

  async fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.step("error", "Run mislukt", message, undefined, "failed");
    await this.db
      .from("agent_runs")
      .update({
        status: "failed",
        error: message,
        steps: toJson(this.steps),
        finished_at: new Date().toISOString(),
      })
      .eq("id", this.runId);
    await this.log({
      action: "run.failed",
      category: "system",
      summary: `${this.actorName}: ${this.options.pipeline} is mislukt - ${message}`,
      metadata: { pipeline: this.options.pipeline },
    });
  }
}

/**
 * Runs a pipeline inside an AgentRuntime with consistent success / failure
 * bookkeeping. Errors are recorded on the run and then rethrown.
 */
export async function withRun<T extends Record<string, unknown>>(
  options: RunOptions,
  fn: (rt: AgentRuntime) => Promise<T>,
): Promise<T> {
  const rt = await AgentRuntime.start(options);
  try {
    const output = await runWithAiContext({ organizationId: options.organizationId, pipeline: options.pipeline }, () => fn(rt));
    await rt.finish(output);
    return output;
  } catch (error) {
    await rt.fail(error);
    throw error;
  }
}

export function toSourceMaterial(m: SourceMessage): SourceMaterial {
  return {
    id: m.id,
    source: m.source as SourceKind,
    channel: m.channel,
    author: m.author_name,
    title: m.title,
    body: m.body,
    occurredAt: m.occurred_at,
    url: m.url,
    metadata: fromJson<Record<string, unknown>>(m.metadata, {}),
  };
}

export async function loadBrandContext(db: AdminClient, organization: Organization): Promise<BrandContext> {
  const [{ data: brand }, { data: examples }] = await Promise.all([
    db.from("brand_guidelines").select("*").eq("organization_id", organization.id).maybeSingle(),
    db
      .from("brand_assets")
      .select("extracted_text")
      .eq("organization_id", organization.id)
      .eq("category", "writing_example")
      .not("extracted_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);
  return {
    organizationName: organization.name,
    personality: brand?.brand_personality ?? "",
    writingStyle: brand?.writing_style ?? "",
    sentenceStructure: brand?.sentence_structure ?? "",
    terminology: fromJson<TermRule[]>(brand?.preferred_terminology, []),
    wordsToAvoid: brand?.words_to_avoid ?? [],
    toneInternal: brand?.tone_internal ?? "",
    toneExternal: brand?.tone_external ?? "",
    toneSocial: brand?.tone_social ?? "",
    policies: brand?.communication_policies ?? "",
    boilerplate: brand?.boilerplate ?? "",
    writingExamples: (examples ?? []).map((e) => e.extracted_text ?? "").filter(Boolean),
  };
}

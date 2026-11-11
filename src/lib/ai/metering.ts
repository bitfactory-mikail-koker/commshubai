import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { AIError } from "@/lib/ai/types";
import { toZoned } from "@/lib/format";
import { redactieSettings } from "@/lib/redactie/settings";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cost metering and the monthly ceiling.
 *
 * Every agent run executes inside `runWithAiContext`, so each model call knows
 * which organization it is for. Before a call the ceiling is checked; after a
 * call the tokens and the estimated cost are recorded in ai_usage.
 */

type Context = { organizationId: string; pipeline: string; task?: string };
const storage = new AsyncLocalStorage<Context>();

export function runWithAiContext<T>(context: { organizationId: string; pipeline: string }, fn: () => Promise<T>): Promise<T> {
  return storage.run({ ...context }, fn);
}

export function runAsTask<T>(task: string, fn: () => Promise<T>): Promise<T> {
  const current = storage.getStore();
  return current ? storage.run({ ...current, task }, fn) : fn();
}

export const currentAiTask = () => storage.getStore()?.task ?? "onbekend";

/** USD per million tokens. Source: Anthropic's published prices at the time of writing; adjust when they change. */
type Price = { input: number; output: number; longInput?: number; longOutput?: number };
const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longInput: 0.5, longOutput: 2.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-fable-5-2": { input: 8, output: 40 },
};
// An unknown model is priced at the highest known rate, so the ceiling errs on the safe side.
const FALLBACK_PRICE: Price = { input: 8, output: 40 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  const price = key ? PRICES[key] : FALLBACK_PRICE;
  // Some models charge a higher rate for prompts above 100K tokens.
  const long = inputTokens > 100_000;
  const input = (long && price.longInput) || price.input;
  const output = (long && price.longOutput) || price.output;
  return (inputTokens * input + outputTokens * output) / 1_000_000;
}

export function monthStart(now = new Date()): Date {
  const z = toZoned(now);
  // The first of the month in the app timezone, as an instant (accurate to the hour, which is enough here).
  const offset = z.getTime() - now.getTime();
  return new Date(new Date(z.getFullYear(), z.getMonth(), 1).getTime() - offset);
}

export async function monthUsage(organizationId: string, now = new Date()): Promise<{ costEur: number; calls: number }> {
  const db = createAdminClient();
  const { data } = await db
    .from("ai_usage")
    .select("cost_eur")
    .eq("organization_id", organizationId)
    .gte("created_at", monthStart(now).toISOString());
  return { costEur: (data ?? []).reduce((sum, row) => sum + Number(row.cost_eur), 0), calls: data?.length ?? 0 };
}

/** Throws when this month's ceiling has been reached. Outside an agent run this is a no-op. */
export async function assertBudget(): Promise<void> {
  const context = storage.getStore();
  if (!context) return;
  const db = createAdminClient();
  const { data: org } = await db.from("organizations").select("settings").eq("id", context.organizationId).single();
  const settings = redactieSettings(org?.settings);
  if (settings.aiBudgetEur <= 0) return; // 0 = no ceiling
  const usage = await monthUsage(context.organizationId);
  if (usage.costEur >= settings.aiBudgetEur) {
    throw new AIError(
      `Het maandplafond voor AI-kosten (€ ${settings.aiBudgetEur.toFixed(0)}) is bereikt. De bot beoordeelt en schrijft niets meer tot de beheerder het plafond verhoogt of de nieuwe maand begint.`,
    );
  }
}

export async function recordUsage(input: { model: string; inputTokens: number; outputTokens: number }): Promise<void> {
  const context = storage.getStore();
  if (!context) return;
  const db = createAdminClient();
  const { data: org } = await db.from("organizations").select("settings").eq("id", context.organizationId).single();
  const costEur = estimateCostUsd(input.model, input.inputTokens, input.outputTokens) * redactieSettings(org?.settings).usdToEur;
  const { error } = await db.from("ai_usage").insert({
    organization_id: context.organizationId,
    task: context.task ?? context.pipeline,
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cost_eur: input.model === "demo-regels" ? 0 : Number(costEur.toFixed(6)),
  });
  if (error) console.error("[ai] could not record usage", error.message);
}

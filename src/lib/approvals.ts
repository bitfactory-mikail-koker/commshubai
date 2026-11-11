import "server-only";
import type { SessionContext } from "@/lib/auth";
import { advanceApproval, startApprovalRound, type AdvanceResult } from "@/lib/redactie/approval-flow";
import type { UserClient } from "@/lib/supabase/server";
import type { Approval, ApprovalDecision, ApprovalEntity } from "@/lib/types";

/**
 * Approval records.
 *
 * Who has to approve follows from the approval rule of the content type
 * (lib/redactie/approval-flow). A decision is always written through the
 * signed-in user's own client, so the database enforces who may decide what
 * (RLS + the trigger that stamps decided_by): a quote only by the person
 * quoted, an assigned step only by the people it is assigned to, and the
 * editors only for their own step or once a deadline has passed.
 */

type Decision = Exclude<ApprovalDecision, "pending" | "withdrawn">;

export async function requestApproval(
  _db: UserClient,
  session: SessionContext,
  entityType: ApprovalEntity,
  entityId: string,
): Promise<{ steps: number; firstStep: string }> {
  // A round always covers the item's current version; the engine reads it itself.
  return startApprovalRound({ organizationId: session.organization.id, entityType, entityId }, { requestedBy: session.userId });
}

async function record(db: UserClient, approval: Pick<Approval, "id">, decision: Decision, note: string | null): Promise<void> {
  const { data: updated, error } = await db.from("approvals").update({ decision, decision_note: note }).eq("id", approval.id).select("id");
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) throw new Error("Missing permission content.approve");
}

async function waitingOn(db: UserClient, approvals: Approval[]): Promise<string> {
  const ids = Array.from(new Set(approvals.flatMap((a) => a.eligible_profile_ids)));
  if (ids.length === 0) return "de redactie";
  const { data } = await db.from("profiles").select("full_name").in("id", ids);
  return (data ?? []).map((p) => p.full_name).join(", ") || "de betrokkenen";
}

/**
 * A decision taken from the editorial workspace on the current round of an
 * item. Decides every open request the user is entitled to decide.
 */
export async function decideApproval(
  db: UserClient,
  session: SessionContext,
  entityType: ApprovalEntity,
  entityId: string,
  version: number,
  decision: Decision,
  note: string | null,
): Promise<AdvanceResult> {
  const load = async () => {
    const { data, error } = await db
      .from("approvals")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("version", version)
      .eq("decision", "pending")
      .order("step", { ascending: true })
      .order("requested_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  const canApprove = session.permissions.has("content.approve");
  /** The open requests this person may decide in one go. */
  const targetsIn = (pending: Approval[]) => {
    const now = Date.now();
    const mine = pending.filter((a) => a.eligible_profile_ids.includes(session.userId));
    if (!canApprove) return mine;
    const editorQueue = pending.filter((a) => a.kind === "piece" && a.eligible_profile_ids.length === 0);
    const overdue = pending.filter(
      (a) => a.kind === "piece" && a.eligible_profile_ids.length > 0 && a.due_at && new Date(a.due_at).getTime() <= now && !mine.includes(a),
    );
    // Consent received from someone without an account (an external interviewee) is recorded by the editors.
    const externalConsent = pending.filter((a) => a.kind !== "piece" && a.eligible_profile_ids.length === 0);
    const own = editorQueue[0];
    if (own && session.organization.settings.require_four_eyes && own.requested_by_profile_id === session.userId) {
      throw new Error("Vier-ogenprincipe: je kunt content die je zelf hebt ingediend niet zelf goedkeuren.");
    }
    return [...mine, ...(own ? [own] : []), ...overdue, ...externalConsent];
  };

  let pending = await load();
  if (pending.length === 0) throw new Error("Er staat geen goedkeuringsverzoek open voor deze versie.");

  if (decision !== "approved") {
    const mine = pending.filter((a) => a.eligible_profile_ids.includes(session.userId));
    const target = mine[0] ?? pending.find((a) => a.kind === "piece" && a.eligible_profile_ids.length === 0) ?? pending.find((a) => a.kind === "piece");
    if (!target) {
      throw new Error("Er ligt nu alleen een verzoek bij de geciteerden zelf. Trek het item terug naar concept als je de tekst wilt aanpassen.");
    }
    await record(db, target, decision, note);
    return { state: "waiting" };
  }

  const first = targetsIn(pending);
  if (first.length === 0) {
    const who = await waitingOn(db, pending);
    throw new Error(
      pending[0].kind === "piece"
        ? `Dit ligt nu ter goedkeuring bij ${who} (${pending[0].step_label ?? "stap"}). De redactie kan beslissen zodra de termijn is verstreken.`
        : `Dit wacht nog op akkoord van ${who} op het eigen citaat. Alleen de geciteerde kan dat geven.`,
    );
  }

  // One "Goedkeuren" covers every consecutive step that is this person's to take.
  let result: AdvanceResult = { state: "waiting" };
  let targets = first;
  for (let round = 0; round < 6 && targets.length > 0; round++) {
    await Promise.all(targets.map((approval) => record(db, approval, "approved", note)));
    result = await advanceApproval({ organizationId: session.organization.id, entityType, entityId }, version);
    if (result.state !== "next_step") break;
    pending = await load();
    targets = targetsIn(pending);
  }
  return result;
}

/** A decision on one specific request, taken by the person it was put to (preview page, "Voor mij"). */
export async function decideOwnApproval(
  db: UserClient,
  session: SessionContext,
  approvalId: string,
  decision: Decision,
  note: string | null,
): Promise<{ approval: Approval; result: AdvanceResult }> {
  const { data: approval, error } = await db.from("approvals").select("*").eq("id", approvalId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!approval) throw new Error("Dit verzoek bestaat niet of is niet aan jou gericht.");
  if (approval.decision !== "pending") throw new Error("Op dit verzoek is al beslist.");

  if (decision === "approved" && approval.kind === "piece") {
    // One person gives one approval per step, also when a step asks for several.
    const { data: same } = await db
      .from("approvals")
      .select("id")
      .eq("entity_type", approval.entity_type)
      .eq("entity_id", approval.entity_id)
      .eq("version", approval.version)
      .eq("step", approval.step)
      .eq("kind", "piece")
      .eq("decision", "approved")
      .eq("decided_by", session.userId);
    if (same && same.length > 0) throw new Error("Je hebt in deze stap al akkoord gegeven. Het tweede akkoord moet van iemand anders komen.");
    if (
      approval.eligible_profile_ids.length === 0 &&
      session.organization.settings.require_four_eyes &&
      approval.requested_by_profile_id === session.userId
    ) {
      throw new Error("Vier-ogenprincipe: je kunt content die je zelf hebt ingediend niet zelf goedkeuren.");
    }
  }

  await record(db, approval, decision, note);
  const result =
    decision === "approved"
      ? await advanceApproval(
          { organizationId: session.organization.id, entityType: approval.entity_type as ApprovalEntity, entityId: approval.entity_id },
          approval.version,
        )
      : ({ state: "waiting" } as AdvanceResult);
  return { approval: { ...approval, decision, decision_note: note, decided_by: session.userId }, result };
}

/**
 * Withdraws open approval requests, e.g. when an item is pulled back to
 * draft. A later submission then starts a fresh round.
 */
export async function withdrawApprovals(db: UserClient, entityType: ApprovalEntity, entityId: string): Promise<void> {
  const { error } = await db
    .from("approvals")
    .update({ decision: "withdrawn" })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("decision", "pending");
  if (error) throw new Error(error.message);
}

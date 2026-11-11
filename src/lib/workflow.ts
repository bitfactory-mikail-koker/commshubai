import type { PermissionKey } from "@/lib/permissions";
import type { ContentStatus } from "@/lib/types";

/**
 * Editorial workflow. The same rules are enforced in the database
 * (trigger enforce_article_workflow) for permissions and human approval;
 * this module decides which transitions are *offered* and valid.
 */
export const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  new_signal: ["research", "draft", "archived"],
  research: ["interview_requested", "draft", "archived"],
  interview_requested: ["interview_completed", "research", "draft", "archived"],
  interview_completed: ["draft", "archived"],
  draft: ["in_review", "archived"],
  in_review: ["approved", "changes_requested", "draft", "archived"],
  changes_requested: ["draft", "in_review", "archived"],
  approved: ["scheduled", "published", "draft", "archived"],
  scheduled: ["published", "approved", "draft"],
  published: ["archived"],
  archived: ["draft"],
};

/** Any one of these permissions allows moving content INTO the given status. */
export const STATUS_PERMISSIONS: Record<ContentStatus, PermissionKey[]> = {
  new_signal: ["content.create", "content.edit"],
  research: ["content.create", "content.edit"],
  interview_requested: ["content.create", "content.edit"],
  interview_completed: ["content.create", "content.edit"],
  draft: ["content.create", "content.edit", "content.publish"],
  in_review: ["content.edit", "content.create"],
  changes_requested: ["content.review", "content.approve"],
  approved: ["content.approve"],
  scheduled: ["content.publish"],
  published: ["content.publish"],
  archived: ["content.edit", "content.publish"],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(
  from: ContentStatus,
  permissions: ReadonlySet<PermissionKey> | PermissionKey[],
): ContentStatus[] {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return TRANSITIONS[from].filter((to) => STATUS_PERMISSIONS[to].some((p) => set.has(p)));
}

/** Content in these statuses is locked for editing until reopened as draft. */
export const LOCKED_STATUSES: ContentStatus[] = ["approved", "scheduled", "published"];

export function isLocked(status: ContentStatus): boolean {
  return LOCKED_STATUSES.includes(status);
}

/** Statuses in which the body can be edited by an editor. */
export function isEditable(status: ContentStatus): boolean {
  return !isLocked(status) && status !== "archived" && status !== "in_review";
}

/** Pipeline stages shown on the editorial board (in order). */
export const PIPELINE_STAGES: { key: string; label: string; statuses: ContentStatus[] }[] = [
  { key: "discovery", label: "Signaal & onderzoek", statuses: ["new_signal", "research"] },
  { key: "interview", label: "Interview", statuses: ["interview_requested", "interview_completed"] },
  { key: "draft", label: "Concept", statuses: ["draft", "changes_requested"] },
  { key: "review", label: "Review", statuses: ["in_review"] },
  { key: "approved", label: "Goedgekeurd & gepland", statuses: ["approved", "scheduled"] },
  { key: "published", label: "Gepubliceerd", statuses: ["published"] },
];

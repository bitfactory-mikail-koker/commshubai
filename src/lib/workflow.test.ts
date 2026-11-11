import { describe, expect, it } from "vitest";
import type { PermissionKey } from "@/lib/permissions";
import { allowedTransitions, canTransition, isEditable, isLocked, TRANSITIONS } from "@/lib/workflow";

describe("editorial workflow", () => {
  it("covers every status", () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(11);
  });

  it("never allows publishing without passing through approval", () => {
    for (const from of ["new_signal", "research", "interview_requested", "interview_completed", "draft", "in_review", "changes_requested"] as const) {
      expect(canTransition(from, "published")).toBe(false);
      expect(canTransition(from, "scheduled")).toBe(false);
    }
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("in_review", "approved")).toBe(true);
    expect(canTransition("approved", "scheduled")).toBe(true);
  });

  it("offers an editor review submission but not approval", () => {
    const editor: PermissionKey[] = ["content.view", "content.create", "content.edit"];
    expect(allowedTransitions("draft", editor)).toContain("in_review");
    expect(allowedTransitions("in_review", editor)).not.toContain("approved");
    expect(allowedTransitions("approved", editor)).not.toContain("published");
  });

  it("lets a reviewer request changes but not approve or publish", () => {
    const reviewer: PermissionKey[] = ["content.view", "content.review"];
    expect(allowedTransitions("in_review", reviewer)).toEqual(["changes_requested"]);
  });

  it("lets a chief editor approve, schedule and publish", () => {
    const chief = new Set<PermissionKey>(["content.view", "content.create", "content.edit", "content.review", "content.approve", "content.publish"]);
    expect(allowedTransitions("in_review", chief)).toEqual(expect.arrayContaining(["approved", "changes_requested"]));
    expect(allowedTransitions("approved", chief)).toEqual(expect.arrayContaining(["scheduled", "published"]));
  });

  it("locks approved content for editing", () => {
    expect(isLocked("approved")).toBe(true);
    expect(isLocked("scheduled")).toBe(true);
    expect(isLocked("published")).toBe(true);
    expect(isEditable("draft")).toBe(true);
    expect(isEditable("in_review")).toBe(false);
  });
});

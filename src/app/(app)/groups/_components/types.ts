import type { AgentKind, RhythmKey } from "@/lib/types";

export type Option = { id: string; name: string };

export type GroupRow = {
  id: string;
  name: string;
  goal: string;
  bureau: AgentKind;
  memberKind: "role" | "team" | "persons";
  functionalRoleId: string | null;
  teamId: string | null;
  /** Hand-picked people (member kind "persons"). */
  memberIds: string[];
  frequency: "weekly" | "biweekly" | "monthly" | "rhythm_only";
  weekday: number;
  windowStart: string;
  windowEnd: string;
  reminderCount: number;
  reminderAfterDays: number;
  afterNoReply: "notify_editors" | "nothing";
  enabled: boolean;
  lastRunAt: string | null;
  /** Names of the active people the group resolves to right now. */
  resolved: string[];
  /** Fixed rhythms that use this group. */
  usedBy: string[];
};

export type RhythmRow = {
  id: string;
  key: RhythmKey;
  daysOfMonth: number[];
  weekday: number | null;
  timeOfDay: string;
  deadlineDays: number;
  groupId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
};

/** The payload saveGroup expects, from a row as it is stored. */
export function groupInput(group: GroupRow) {
  return {
    id: group.id,
    name: group.name,
    goal: group.goal,
    bureau: group.bureau,
    memberKind: group.memberKind,
    functionalRoleId: group.functionalRoleId,
    teamId: group.teamId,
    memberIds: group.memberIds,
    frequency: group.frequency,
    weekday: group.weekday,
    windowStart: group.windowStart,
    windowEnd: group.windowEnd,
    reminderCount: group.reminderCount,
    reminderAfterDays: group.reminderAfterDays,
    afterNoReply: group.afterNoReply,
    enabled: group.enabled,
  };
}

export function rhythmInput(rhythm: RhythmRow) {
  return {
    id: rhythm.id,
    daysOfMonth: rhythm.daysOfMonth,
    weekday: rhythm.weekday,
    timeOfDay: rhythm.timeOfDay,
    deadlineDays: rhythm.deadlineDays,
    groupId: rhythm.groupId,
    enabled: rhythm.enabled,
  };
}

export function namesLine(names: string[], max = 4): string {
  if (names.length === 0) return "Nog niemand";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} en ${names.length - max} anderen`;
}

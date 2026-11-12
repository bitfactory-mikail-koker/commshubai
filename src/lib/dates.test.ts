import { describe, expect, it } from "vitest";
import { formatDateTime, toDateTimeLocal, zonedInputFromNow, zonedInputToIso } from "@/lib/format";
import { addWorkingDays, nextWorkingMoment, workingDaysBetween } from "@/lib/redactie/workdays";

describe("wall-clock input in the app timezone", () => {
  it("converts around both daylight-saving changes", () => {
    expect(zonedInputToIso("2026-11-12T09:00")).toBe("2026-11-12T08:00:00.000Z");
    expect(zonedInputToIso("2026-03-29T09:00")).toBe("2026-03-29T07:00:00.000Z");
    expect(zonedInputToIso("2026-10-25T09:00")).toBe("2026-10-25T08:00:00.000Z");
  });

  it("rejects values that are not a datetime-local string", () => {
    expect(zonedInputToIso("morgen")).toBe("");
    expect(zonedInputToIso("")).toBe("");
  });

  it("round-trips through the display value", () => {
    const iso = zonedInputToIso("2026-07-01T14:30");
    expect(toDateTimeLocal(iso)).toBe("2026-07-01T14:30");
    expect(formatDateTime(iso)).toContain("14:30");
  });

  it("builds a value for a later day at a fixed hour", () => {
    expect(zonedInputFromNow(2, 9)).toMatch(/^\d{4}-\d{2}-\d{2}T09:00$/);
  });
});

describe("working days across a daylight-saving change", () => {
  it("keeps the wall-clock time when adding working days over the spring change", () => {
    const friday = new Date("2026-03-27T08:00:00Z");
    expect(addWorkingDays(friday, 1).toISOString()).toBe("2026-03-30T07:00:00.000Z");
  });

  it("keeps the wall-clock time when adding working days over the autumn change", () => {
    const friday = new Date("2026-10-23T07:00:00Z");
    expect(addWorkingDays(friday, 1).toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  it("opens at the start of the next working day", () => {
    const saturday = new Date("2026-03-28T10:00:00Z");
    expect(nextWorkingMoment(saturday, "08:30", "17:30").toISOString()).toBe("2026-03-30T06:30:00.000Z");
  });

  it("counts only whole working days", () => {
    expect(workingDaysBetween(new Date("2026-11-11T09:00:00Z"), new Date("2026-11-12T08:00:00Z"))).toBe(0);
    expect(workingDaysBetween(new Date("2026-11-13T09:00:00Z"), new Date("2026-11-16T09:00:00Z"))).toBe(1);
    expect(workingDaysBetween(new Date("2026-11-13T09:00:00Z"), new Date("2026-11-16T08:00:00Z"))).toBe(0);
    expect(workingDaysBetween(new Date("2026-11-16T09:00:00Z"), new Date("2026-11-11T09:00:00Z"))).toBe(0);
  });
});

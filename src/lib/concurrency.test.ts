import { describe, expect, it } from "vitest";
import { chunk, errorMessage, groupBy, mapConcurrent, mapSettled } from "@/lib/concurrency";

describe("mapConcurrent", () => {
  it("keeps the order of the input in the output", async () => {
    const result = await mapConcurrent([30, 5, 15], async (ms, index) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return `${index}:${ms}`;
    });
    expect(result).toEqual(["0:30", "1:5", "2:15"]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await mapConcurrent(
      Array.from({ length: 12 }, (_, index) => index),
      async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
      },
      3,
    );
    expect(peak).toBe(3);
  });

  it("rejects when one of the calls fails", async () => {
    await expect(
      mapConcurrent([1, 2, 3], async (n) => {
        if (n === 2) throw new Error("kapot");
        return n;
      }),
    ).rejects.toThrow("kapot");
  });
});

describe("mapSettled", () => {
  it("keeps going after a failure and reports every outcome in order", async () => {
    const finished: number[] = [];
    const result = await mapSettled([1, 2, 3, 4], async (n) => {
      if (n === 2) throw new Error("kapot");
      finished.push(n);
      return n * 10;
    });
    expect(finished.sort()).toEqual([1, 3, 4]);
    expect(result.map((entry) => entry.ok)).toEqual([true, false, true, true]);
    expect(result[0]).toEqual({ ok: true, value: 10 });
    expect(result[1].ok === false && errorMessage(result[1].error)).toBe("kapot");
  });
});

describe("chunk", () => {
  it("splits into parts of at most the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("groupBy", () => {
  it("groups in first-seen order", () => {
    const groups = groupBy(["a1", "b1", "a2"], (value) => value[0]);
    expect([...groups.keys()]).toEqual(["a", "b"]);
    expect(groups.get("a")).toEqual(["a1", "a2"]);
  });
});

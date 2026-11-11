import { describe, expect, it } from "vitest";
import { groupBy, mapConcurrent } from "@/lib/concurrency";

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

describe("groupBy", () => {
  it("groups in first-seen order", () => {
    const groups = groupBy(["a1", "b1", "a2"], (value) => value[0]);
    expect([...groups.keys()]).toEqual(["a", "b"]);
    expect(groups.get("a")).toEqual(["a1", "a2"]);
  });
});

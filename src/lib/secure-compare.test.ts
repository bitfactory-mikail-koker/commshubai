import { describe, expect, it } from "vitest";
import { safeEqual } from "@/lib/secure-compare";

describe("safeEqual", () => {
  it("accepts equal strings and rejects different ones of any length", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("short", "a much longer value")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

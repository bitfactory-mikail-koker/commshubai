import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

export function safeEqual(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

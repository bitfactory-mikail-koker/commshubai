import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toUserMessage } from "@/lib/result";

const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");

function guardMessages(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .flatMap((file) => [...readFileSync(path.join(MIGRATIONS, file), "utf8").matchAll(/raise exception '((?:[^']|'')+)'/g)].map((match) => match[1].replaceAll("''", "'").replaceAll("%", "x")));
}

describe("database guard messages", () => {
  const messages = guardMessages();

  it("finds the messages in the migrations", () => {
    expect(messages.length).toBeGreaterThan(15);
  });

  it("shows every one of them to the user in Dutch", () => {
    const untranslated = messages.filter((message) => toUserMessage(new Error(message)) === message);
    expect(untranslated).toEqual([]);
  });
});

describe("form validation messages", () => {
  it("come in Dutch by default", () => {
    const result = z.string().min(3).safeParse("a");
    expect(result.success).toBe(false);
    const message = result.success ? "" : result.error.issues[0].message;
    expect(message).not.toMatch(/Too small|expected/i);
    expect(message.length).toBeGreaterThan(0);
  });
});

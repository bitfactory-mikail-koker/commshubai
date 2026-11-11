import "server-only";
import { ClaudeProvider } from "@/lib/ai/claude";
import { DemoProvider } from "@/lib/ai/demo";
import { assertBudget, recordUsage, runAsTask } from "@/lib/ai/metering";
import type { AIProvider } from "@/lib/ai/types";
import { env } from "@/lib/env";

let provider: AIProvider | null = null;

/**
 * Every task method checks the monthly cost ceiling first and runs under its
 * own task name, so usage is recorded per task. The rule-based demo provider
 * costs nothing; its calls are still counted.
 */
function metered(inner: AIProvider): AIProvider {
  return new Proxy(inner, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || typeof property !== "string") return value;
      return (...args: unknown[]) =>
        runAsTask(property, async () => {
          await assertBudget();
          const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          if (target.id === "demo") await recordUsage({ model: target.model, inputTokens: 0, outputTokens: 0 });
          return result;
        });
    },
  });
}

/**
 * Returns the configured AI provider. With ANTHROPIC_API_KEY set this is the
 * Claude API; without it the app runs on the rule-based demo provider and the
 * UI labels all AI output as demo output.
 */
export function getAIProvider(): AIProvider {
  if (!provider) {
    const apiKey = env.anthropicApiKey;
    provider = metered(apiKey ? new ClaudeProvider(apiKey, env.anthropicModel, env.anthropicTriageModel) : new DemoProvider());
  }
  return provider;
}

export function aiStatus(): { id: "claude" | "demo"; model: string; triageModel: string; label: string } {
  const p = getAIProvider();
  return {
    id: p.id,
    model: p.model,
    triageModel: p.triageModel,
    label: p.id === "claude" ? `Claude API (${p.model})` : "Demo-modus (zonder Claude API)",
  };
}

export type { AIProvider } from "@/lib/ai/types";

import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabasePublishableKey() {
    return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get anthropicApiKey(): string | null {
    return process.env.ANTHROPIC_API_KEY?.trim() || null;
  },
  get anthropicModel() {
    return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
  },
  /** The cheap, fast model that judges incoming Slack messages and tips. */
  get anthropicTriageModel() {
    return process.env.ANTHROPIC_TRIAGE_MODEL?.trim() || "claude-haiku-5-5";
  },
  get slackLoginEnabled() {
    return process.env.NEXT_PUBLIC_SLACK_LOGIN === "true";
  },
  get googleLoginEnabled() {
    return process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "true";
  },
  get inboundMailSecret(): string | null {
    return process.env.INBOUND_MAIL_SECRET?.trim() || null;
  },
  get encryptionKey(): string | null {
    return process.env.INTEGRATION_ENCRYPTION_KEY?.trim() || null;
  },
  get cronSecret(): string | null {
    return process.env.CRON_SECRET?.trim() || null;
  },
  get demoMode() {
    return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  },
  get appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  },
};

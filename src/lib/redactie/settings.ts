import type { OrgSettings } from "@/lib/types";

/**
 * Settings that steer the bot's conduct. Stored on organizations.settings;
 * this module is the single place that knows the defaults.
 */
export type RedactieSettings = {
  botName: string;
  /** The bot only shows the editors what it would do; nothing reaches colleagues. */
  shadowMode: boolean;
  /** Everything stops: no messages, no new proposals. */
  botPaused: boolean;
  /** Only people in the pilot group are approached. */
  pilotOnly: boolean;
  /** Never more than one new request per person in this many days. Approval requests do not count. */
  minDaysBetweenRequests: number;
  workStart: string;
  workEnd: string;
  lookbackMaxDays: number;
  aiBudgetEur: number;
  usdToEur: number;
  /** Only mail from this domain is processed. Empty: the mailbox is closed. */
  mailDomain: string;
  mailboxAddress: string;
  contactPerson: string;
  signalRetentionMonths: number;
};

export const REDACTIE_DEFAULTS: RedactieSettings = {
  botName: "Content Director",
  shadowMode: true,
  botPaused: false,
  pilotOnly: false,
  minDaysBetweenRequests: 7,
  workStart: "08:30",
  workEnd: "17:30",
  lookbackMaxDays: 90,
  aiBudgetEur: 150,
  usdToEur: 0.92,
  mailDomain: "",
  mailboxAddress: "",
  contactPerson: "",
  signalRetentionMonths: 12,
};

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const time = (value: unknown, fallback: string) => (typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : fallback);
const text = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);

export function redactieSettings(raw: unknown): RedactieSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as OrgSettings;
  const d = REDACTIE_DEFAULTS;
  return {
    botName: text(s.bot_name, d.botName).trim() || d.botName,
    shadowMode: s.shadow_mode ?? d.shadowMode,
    botPaused: s.bot_paused ?? d.botPaused,
    pilotOnly: s.pilot_only ?? d.pilotOnly,
    minDaysBetweenRequests: num(s.min_days_between_requests, d.minDaysBetweenRequests, 0, 90),
    workStart: time(s.work_start, d.workStart),
    workEnd: time(s.work_end, d.workEnd),
    lookbackMaxDays: num(s.lookback_max_days, d.lookbackMaxDays, 0, 365),
    aiBudgetEur: num(s.ai_budget_eur, d.aiBudgetEur, 0, 100_000),
    usdToEur: num(s.usd_to_eur, d.usdToEur, 0.1, 10),
    mailDomain: text(s.mail_domain, d.mailDomain).trim().toLowerCase().replace(/^@/, ""),
    mailboxAddress: text(s.mailbox_address, d.mailboxAddress).trim(),
    contactPerson: text(s.contact_person, d.contactPerson).trim(),
    signalRetentionMonths: num(s.signal_retention_months, d.signalRetentionMonths, 1, 120),
  };
}

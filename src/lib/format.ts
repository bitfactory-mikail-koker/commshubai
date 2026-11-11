import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

type DateInput = string | Date | null | undefined;

/**
 * All dates are shown in this timezone, on the server and in the browser, so
 * output does not depend on where the app is hosted (and never differs
 * between server render and hydration).
 */
export const APP_TIMEZONE = "Europe/Amsterdam";

const zoneFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Returns a Date whose *local* fields equal the wall-clock time in the app
 * timezone. Use it for calendar math and formatting, never for storage.
 */
export function toZoned(value: Date): Date {
  const parts: Record<string, number> = {};
  for (const part of zoneFormatter.formatToParts(value)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : toZoned(d);
}

function toInstant(value: DateInput): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Start-of-today etc. must be compared against "now" in the same zone. */
const zonedNow = () => toZoned(new Date());
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const shiftDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

export function formatDate(value: DateInput, pattern = "d MMM yyyy"): string {
  const d = toDate(value);
  return d ? format(d, pattern, { locale: nl }) : "-";
}

export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  return d ? format(d, "d MMM yyyy 'om' HH:mm", { locale: nl }) : "-";
}

export function formatTime(value: DateInput): string {
  const d = toDate(value);
  return d ? format(d, "HH:mm", { locale: nl }) : "-";
}

/** "vandaag 14:30", "morgen 09:00", "gisteren 16:12" or a full date. */
export function formatDay(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "-";
  const time = format(d, "HH:mm");
  const now = zonedNow();
  if (sameDay(d, now)) return `vandaag ${time}`;
  if (sameDay(d, shiftDays(now, 1))) return `morgen ${time}`;
  if (sameDay(d, shiftDays(now, -1))) return `gisteren ${time}`;
  return format(d, "EEE d MMM HH:mm", { locale: nl });
}

export function formatRelative(value: DateInput): string {
  const d = toInstant(value);
  return d ? formatDistanceToNow(d, { addSuffix: true, locale: nl }) : "-";
}

export function formatMonth(value: DateInput): string {
  const d = toDate(value);
  return d ? format(d, "MMMM yyyy", { locale: nl }) : "-";
}

/** Value for <input type="datetime-local"> in local time. */
export function toDateTimeLocal(value: DateInput): string {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function truncate(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function wordCount(html: string | null | undefined): number {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

// --- <input type="datetime-local"> ------------------------------------------
// A value typed into a datetime-local input is a wall-clock time in the app
// timezone - not in the browser's or the server's zone.

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Offset (ms) between the app timezone and UTC at the given instant. */
function zoneOffset(timestamp: number): number {
  const z = toZoned(new Date(timestamp));
  const wallAsUtc = Date.UTC(z.getFullYear(), z.getMonth(), z.getDate(), z.getHours(), z.getMinutes(), z.getSeconds());
  return wallAsUtc - Math.floor(timestamp / 1000) * 1000;
}

/** "2026-11-12T09:00" (app timezone) → ISO timestamp. Returns "" when invalid. */
export function zonedInputToIso(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  const [, y, mo, d, h, mi] = match.map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(wallAsUtc)) return "";
  let timestamp = wallAsUtc - zoneOffset(wallAsUtc);
  // Around a daylight-saving change the first guess can be an hour off.
  const corrected = wallAsUtc - zoneOffset(timestamp);
  if (corrected !== timestamp) timestamp = corrected;
  return new Date(timestamp).toISOString();
}

/** Input value for "today + days at hour:00" in the app timezone. */
export function zonedInputFromNow(days: number, hour: number): string {
  const now = toZoned(new Date());
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, 0);
  return `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}T${pad2(target.getHours())}:${pad2(target.getMinutes())}`;
}

/**
 * Parses a date sent by a form. ISO timestamps with an offset are taken as
 * is; a naive datetime-local value is read as wall-clock time in the app
 * timezone, so the result does not depend on the server's timezone.
 */
export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
  const date = new Date(hasOffset ? value : zonedInputToIso(value) || value);
  return Number.isNaN(date.getTime()) ? null : date;
}

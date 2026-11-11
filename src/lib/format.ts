import { TZDate } from "@date-fns/tz";
import { addDays, format, formatDistanceToNow, isSameDay, set, subDays } from "date-fns";
import { nl } from "date-fns/locale";

const euroFormatter = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export const formatEuro = (value: number): string => euroFormatter.format(value);

const INPUT_PATTERN = "yyyy-MM-dd'T'HH:mm";

type DateInput = string | Date | null | undefined;

/**
 * All dates are shown in this timezone, on the server and in the browser, so
 * output does not depend on where the app is hosted (and never differs
 * between server render and hydration).
 */
export const APP_TIMEZONE = "Europe/Amsterdam";

export function toZoned(value: Date): TZDate {
  return new TZDate(value, APP_TIMEZONE);
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
const zonedNow = () => TZDate.tz(APP_TIMEZONE);

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
  if (isSameDay(d, now)) return `vandaag ${time}`;
  if (isSameDay(d, addDays(now, 1))) return `morgen ${time}`;
  if (isSameDay(d, subDays(now, 1))) return `gisteren ${time}`;
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
  return d ? format(d, INPUT_PATTERN) : "";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function truncate(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function zonedInputToIso(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  const [, year, month, day, hour, minute] = match.map(Number);
  const instant = new TZDate(year, month - 1, day, hour, minute, 0, APP_TIMEZONE);
  return Number.isNaN(instant.getTime()) ? "" : new Date(instant.getTime()).toISOString();
}

export function zonedInputFromNow(days: number, hour: number): string {
  return format(set(addDays(zonedNow(), days), { hours: hour, minutes: 0, seconds: 0, milliseconds: 0 }), INPUT_PATTERN);
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

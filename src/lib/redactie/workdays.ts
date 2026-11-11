import { toZoned } from "@/lib/format";

/**
 * Working-time arithmetic in the app timezone. The bot only writes to people
 * on working days between the configured hours, and deadlines count working
 * days. Public holidays are not known to the system.
 */

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const isWeekend = (zoned: Date) => zoned.getDay() === 0 || zoned.getDay() === 6;

export function isWorkingTime(now: Date, workStart: string, workEnd: string): boolean {
  const z = toZoned(now);
  if (isWeekend(z)) return false;
  const minutes = z.getHours() * 60 + z.getMinutes();
  return minutes >= minutesOf(workStart) && minutes < minutesOf(workEnd);
}

/** The first moment at or after `now` that falls inside working hours. */
export function nextWorkingMoment(now: Date, workStart: string, workEnd: string): Date {
  if (isWorkingTime(now, workStart, workEnd)) return now;
  const z = toZoned(now);
  const minutes = z.getHours() * 60 + z.getMinutes();
  // Minutes until the start of the next working day (in wall-clock time).
  let days = minutes < minutesOf(workStart) && !isWeekend(z) ? 0 : 1;
  for (;;) {
    const candidate = new Date(z.getFullYear(), z.getMonth(), z.getDate() + days);
    if (!isWeekend(candidate)) break;
    days++;
  }
  const deltaMinutes = days * 24 * 60 + minutesOf(workStart) - minutes;
  // Round to the minute; a daylight-saving change can shift this by an hour, which is harmless here.
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000 + deltaMinutes * 60_000);
}

/** Adds working days (Monday to Friday) to an instant, keeping the time of day. */
export function addWorkingDays(from: Date, days: number): Date {
  const result = new Date(from);
  let remaining = Math.max(0, Math.round(days));
  while (remaining > 0) {
    result.setTime(result.getTime() + 86_400_000);
    if (!isWeekend(toZoned(result))) remaining--;
  }
  return result;
}

/** Whole working days that have passed between two instants. */
export function workingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const cursor = new Date(from);
  while (cursor.getTime() + 86_400_000 <= to.getTime()) {
    cursor.setTime(cursor.getTime() + 86_400_000);
    if (!isWeekend(toZoned(cursor))) count++;
  }
  return count;
}

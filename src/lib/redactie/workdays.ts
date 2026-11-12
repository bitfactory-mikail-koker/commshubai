import { addBusinessDays, addDays, differenceInDays, eachDayOfInterval, isWeekend, set, startOfDay } from "date-fns";
import { toZoned } from "@/lib/format";

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const startOfWork = (day: Date, workStart: string) =>
  set(startOfDay(day), { hours: Math.floor(minutesOf(workStart) / 60), minutes: minutesOf(workStart) % 60 });

export function isWorkingTime(now: Date, workStart: string, workEnd: string): boolean {
  const z = toZoned(now);
  if (isWeekend(z)) return false;
  const minutes = z.getHours() * 60 + z.getMinutes();
  return minutes >= minutesOf(workStart) && minutes < minutesOf(workEnd);
}

export function nextWorkingMoment(now: Date, workStart: string, workEnd: string): Date {
  if (isWorkingTime(now, workStart, workEnd)) return now;
  const z = toZoned(now);
  const todayStart = startOfWork(z, workStart);
  const next = !isWeekend(z) && z.getTime() < todayStart.getTime() ? todayStart : startOfWork(addBusinessDays(z, 1), workStart);
  return new Date(next.getTime());
}

export function addWorkingDays(from: Date, days: number): Date {
  return new Date(addBusinessDays(toZoned(from), Math.max(0, Math.round(days))).getTime());
}

export function workingDaysBetween(from: Date, to: Date): number {
  const start = toZoned(from);
  const wholeDays = differenceInDays(toZoned(to), start);
  if (wholeDays <= 0) return 0;
  return eachDayOfInterval({ start: addDays(start, 1), end: addDays(start, wholeDays) }).filter((day) => !isWeekend(day)).length;
}

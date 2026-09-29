import { signal } from '@angular/core';

export const MINUTES_PER_DAY = 1440;

export type DateStyle = 'numeric' | 'name';
/** How dates are written: "30.9." or "30 Sep". Set from the user's preferences. */
export const dateStyle = signal<DateStyle>('numeric');

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local-date key (YYYY-MM-DD) of a Date. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses a YYYY-MM-DD key as a local date (noon, to dodge DST edge cases). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Monday of the week containing `key`. */
export function startOfWeek(key: string): string {
  const d = fromDateKey(key);
  const diff = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(key, -diff);
}

export function dateRange(startDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(startDate, i));
}

/** Sorted, de-duplicated copy of a list of date keys. */
export function normalizeDates(dates: string[]): string[] {
  return [...new Set(dates)].sort();
}

/** True when the dates form one unbroken run of days. */
export function isContiguous(dates: string[]): boolean {
  for (let i = 1; i < dates.length; i++) {
    if (addDays(dates[i - 1], 1) !== dates[i]) return false;
  }
  return true;
}

export function weekdayShort(key: string): string {
  return WEEKDAYS_SHORT[fromDateKey(key).getDay()];
}

export function weekdayLong(key: string): string {
  return WEEKDAYS_LONG[fromDateKey(key).getDay()];
}

/** "24.9." or "24 Sep", depending on the chosen date style. */
export function dayMonth(key: string): string {
  const d = fromDateKey(key);
  return dateStyle() === 'numeric'
    ? `${d.getDate()}.${d.getMonth() + 1}.`
    : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Joins a date and a year: "24.9.2026" or "24 Sep 2026". */
function withYear(key: string): string {
  const y = fromDateKey(key).getFullYear();
  return dateStyle() === 'numeric' ? `${dayMonth(key)}${y}` : `${dayMonth(key)} ${y}`;
}

/** "Tue 24 Sep" */
export function shortDate(key: string): string {
  return `${weekdayShort(key)} ${dayMonth(key)}`;
}

/** "23 Sep – 29 Sep 2026", or "5 days · 23 Sep – 12 Oct 2026" when the days are not consecutive. */
export function rangeLabel(dates: string[]): string {
  if (dates.length === 0) return 'No days picked';
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (dates.length === 1) return `${weekdayShort(first)} ${withYear(first)}`;
  const sameYear = fromDateKey(first).getFullYear() === fromDateKey(last).getFullYear();
  const span = `${sameYear ? dayMonth(first) : withYear(first)} – ${withYear(last)}`;
  return isContiguous(dates) ? span : `${dates.length} days · ${span}`;
}

/** Hour choices for the organiser's "between" pickers: { value: minutes, label: "08:00" }. */
export const HOUR_OPTIONS = Array.from({ length: 25 }, (_, h) => ({
  value: h * 60,
  label: formatMinutes(h * 60),
}));

/** 570 → "09:30", 1440 → "24:00" */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad(h)}:${pad(m)}`;
}

/** 90 → "1.5 h", 180 → "3 h" */
export function formatDuration(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

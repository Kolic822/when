import { toUtc } from './zone';

export interface CalendarEntry {
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  start: number; // minutes from midnight (local)
  end: number;
  url: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function toUtcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escapes text for an iCalendar property value. */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds long lines at 75 octets as RFC 5545 requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ' ' + rest.slice(73);
  }
  out.push(rest);
  return out.join('\r\n');
}

/** Builds a single-event iCalendar document (local time expressed in UTC). */
export function buildIcs(entry: CalendarEntry): string {
  const uid = `${entry.date}-${entry.start}-${Math.random().toString(36).slice(2, 10)}@when`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//When//Meetup//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(toUtc(entry.date, entry.start))}`,
    `DTEND:${toUtcStamp(toUtc(entry.date, entry.end))}`,
    `SUMMARY:${escapeText(entry.title)}`,
    `DESCRIPTION:${escapeText(entry.description)}`,
    `URL:${entry.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

const isApple = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Hands the .ics to the device's default calendar app. iOS opens the
 * "Add to Calendar" sheet from a calendar data URL; everywhere else the
 * file is downloaded and opens in the default calendar app.
 */
export function openInCalendar(ics: string, filename = 'meetup.ics'): void {
  if (isApple()) {
    window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
    return;
  }
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

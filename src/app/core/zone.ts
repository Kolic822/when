import { computed, signal } from '@angular/core';
import { addDays, formatMinutes } from './time';

/**
 * Time zones. A When keeps its times in the organiser's zone ("event time").
 * Someone in another zone sees them converted to their own, unless they switch
 * to event time. The calendar grid itself stays in event days; a small ⁺¹ or ⁻¹
 * marks a time that falls on the next or previous day for the viewer.
 */
export type ZoneMode = 'mine' | 'event';

const MODE_KEY = 'when:zone-mode';
const OVERRIDE_KEY = 'when:tz';

/** Zone of the When on screen; null for Whens made before zones were stored. */
export const eventZone = signal<string | null>(null);
export const zoneMode = signal<ZoneMode>(read(MODE_KEY) === 'event' ? 'event' : 'mine');
/** A zone picked by hand in the menu instead of the device's own. */
export const zoneOverride = signal<string | null>(validZone(read(OVERRIDE_KEY)));

export const deviceZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const viewerZone = computed(() => zoneOverride() ?? deviceZone);

export function setZoneMode(mode: ZoneMode): void {
  zoneMode.set(mode);
  write(MODE_KEY, mode);
}

export function setZoneOverride(zone: string | null): void {
  const clean = validZone(zone);
  zoneOverride.set(clean);
  write(OVERRIDE_KEY, clean);
}

/** "Europe/Zagreb" → "Zagreb", "America/New_York" → "New York". */
export function zoneCity(zone: string): string {
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
}

const offsets = new Map<string, number>();

/** Minutes the zone is ahead of UTC on that day (taken at noon, so a clock change counts from that day). */
export function zoneOffset(zone: string, date: string): number {
  const key = `${zone}|${date}`;
  const hit = offsets.get(key);
  if (hit !== undefined) return hit;
  const at = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  const offset = Math.round((asUtc - at.getTime()) / 60_000);
  offsets.set(key, offset);
  return offset;
}

/** Minutes to add to an event time on that day to get the viewer's time. */
export function shiftOn(date: string, zone: string | null = eventZone()): number {
  if (!zone || zoneMode() === 'event') return 0;
  const mine = viewerZone();
  return mine === zone ? 0 : zoneOffset(mine, date) - zoneOffset(zone, date);
}

/** True when the viewer's clock differs from the When's on any of these days. */
export function zoneDiffers(dates: string[], zone: string | null = eventZone()): boolean {
  if (!zone) return false;
  const mine = viewerZone();
  return mine !== zone && dates.some((d) => zoneOffset(mine, d) !== zoneOffset(zone, d));
}

/** The viewer's day and minutes for an event time. */
export function toViewer(
  date: string,
  min: number,
  zone: string | null = eventZone(),
): { date: string; min: number } {
  const shift = shiftOn(date, zone);
  if (!shift) return { date, min };
  const total = min + shift;
  const days = Math.floor(total / 1440);
  return { date: days ? addDays(date, days) : date, min: total - days * 1440 };
}

/** "02:00", or "01:00⁺¹" when it is already the next day for the viewer. */
export function timeAt(date: string, min: number, zone: string | null = eventZone()): string {
  const shift = shiftOn(date, zone);
  if (!shift) return formatMinutes(min);
  const total = min + shift;
  const days = Math.floor(total / 1440);
  return formatMinutes(total - days * 1440) + mark(days);
}

/** The viewer's day on which an event time falls (for "Mon 5 Oct" next to a session). */
export function dayOf(date: string, min: number, zone: string | null = eventZone()): string {
  return toViewer(date, min, zone).date;
}

/** "13:00 – 15:00" for a session, in the viewer's time; the end is marked if it runs past midnight. */
export function spanAt(
  date: string,
  start: number,
  end: number,
  zone: string | null = eventZone(),
): string {
  const shift = shiftOn(date, zone);
  if (!shift) return `${formatMinutes(start)} – ${formatMinutes(end)}`;
  const from = toViewer(date, start, zone);
  const total = end + shift;
  const startDays = Math.floor((start + shift) / 1440);
  const endDays = Math.floor(total / 1440) - startDays;
  // A session ending exactly at midnight reads better as 24:00 than as 00:00⁺¹.
  const endMin = total - (startDays + endDays) * 1440;
  const endText = endMin === 0 && endDays === 1 ? '24:00' : formatMinutes(endMin) + mark(endDays);
  return `${formatMinutes(from.min)} – ${endText}`;
}

/** Absolute moment of an event time, for calendar files. */
export function toUtc(date: string, min: number, zone: string | null = eventZone()): Date {
  const [y, m, d] = date.split('-').map(Number);
  if (!zone) {
    const local = new Date(y, m - 1, d, 0, 0, 0, 0);
    local.setMinutes(min);
    return local;
  }
  return new Date(Date.UTC(y, m - 1, d, 0, min) - zoneOffset(zone, date) * 60_000);
}

function mark(days: number): string {
  return days > 0 ? '⁺¹' : days < 0 ? '⁻¹' : '';
}

function validZone(zone: string | null): string | null {
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

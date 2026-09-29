import { fromDateKey } from './time';

/** Something already in the person's own calendar. */
export interface BusyBlock {
  start: number;
  end: number;
  title: string;
}

/** Made-up events per weekday (0 = Sunday), so every day looks a little different. */
const SAMPLE: Record<number, BusyBlock[]> = {
  0: [{ start: 12 * 60, end: 14 * 60, title: 'Family lunch' }],
  1: [
    { start: 9 * 60, end: 17 * 60, title: 'Work' },
    { start: 18 * 60 + 30, end: 19 * 60 + 30, title: 'Gym' },
  ],
  2: [{ start: 9 * 60, end: 17 * 60, title: 'Work' }],
  3: [
    { start: 9 * 60, end: 17 * 60, title: 'Work' },
    { start: 20 * 60, end: 22 * 60, title: 'Football' },
  ],
  4: [
    { start: 9 * 60, end: 17 * 60, title: 'Work' },
    { start: 17 * 60 + 30, end: 18 * 60 + 30, title: 'Dentist' },
  ],
  5: [{ start: 9 * 60, end: 15 * 60, title: 'Work' }],
  6: [{ start: 10 * 60, end: 11 * 60 + 30, title: 'Brunch' }],
};

/**
 * Preview of "Connect calendar": sample events only, nothing is read from a real
 * calendar yet. Returns what falls inside the visible hours of that day.
 */
export function sampleBusy(date: string, dayStart: number, dayEnd: number): BusyBlock[] {
  return (SAMPLE[fromDateKey(date).getDay()] ?? [])
    .map((b) => ({ ...b, start: Math.max(b.start, dayStart), end: Math.min(b.end, dayEnd) }))
    .filter((b) => b.end > b.start);
}

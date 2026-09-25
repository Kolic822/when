import { CommonWindow, MeetEvent, Participant, Slot } from './models';

interface Interval {
  start: number;
  end: number;
}

/** Sorts and merges overlapping/adjacent intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

/** Merges slots per day (keeping the first note of merged periods); sorted by date then start. */
export function mergeSlots(slots: Slot[]): Slot[] {
  const byDate = new Map<string, Slot[]>();
  for (const s of slots) {
    if (s.end - s.start <= 0) continue;
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }
  const out: Slot[] = [];
  for (const [date, list] of [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    let cur: Slot | null = null;
    for (const s of sorted) {
      if (cur && s.start <= cur.end) {
        cur.end = Math.max(cur.end, s.end);
        if (!cur.note && s.note) cur.note = s.note;
      } else {
        if (cur) out.push(cur);
        cur = { date, start: s.start, end: s.end, ...(s.note ? { note: s.note } : {}) };
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Remarks attached to periods that overlap a window on that day. */
function notesFor(participants: Participant[], w: CommonWindow): { name: string; note: string }[] {
  const out: { name: string; note: string }[] = [];
  for (const p of participants) {
    for (const s of p.slots) {
      if (s.date === w.date && s.note && s.start < w.end && s.end > w.start)
        out.push({ name: p.name, note: s.note });
    }
  }
  return out;
}

/** Intersection of two sorted, merged interval lists. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (start < end) out.push({ start, end });
    if (a[i].end < b[j].end) i++;
    else j++;
  }
  return out;
}

/** The best candidate: fewest people leaving early, then the longest overlap, then the earliest. */
export function bestWindow(windows: CommonWindow[]): CommonWindow | null {
  if (!windows.length) return null;
  const score = (w: CommonWindow) =>
    [w.partial?.length ?? 0, -(w.end - w.start), w.date, w.start] as const;
  const cmp = (a: readonly (number | string)[], b: readonly (number | string)[]) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  };
  return windows.reduce((a, b) => (cmp(score(a), score(b)) <= 0 ? a : b));
}

export interface AvailabilityResult {
  windows: CommonWindow[];
  /** Participants that have entered at least one slot. */
  answered: Participant[];
  /** Participants that have not entered anything yet. */
  pending: Participant[];
}

/**
 * Finds candidate windows on each event day. Participants with no slots are
 * listed as pending and do not block the result, so people see candidates as
 * answers come in.
 *
 * - Default: windows at least as long as the meetup where everyone who
 *   answered is free the whole time.
 * - Partial attendance (`event.partialOk`): meetup-length windows where
 *   everyone who answered is free for at least part of it; people who are not
 *   free for the whole window are listed in `partial`.
 */
export function findCommonWindows(event: MeetEvent): AvailabilityResult {
  const answered = event.participants.filter((p) => p.slots.length > 0);
  const pending = event.participants.filter((p) => p.slots.length === 0);
  const minLen = Math.round(event.durationHours * 60);
  const windows: CommonWindow[] = [];

  // Common slots only mean something once at least two people have answered.
  if (answered.length < 2) return { windows, answered, pending };
  if (event.partialOk) {
    const partial = findPartialWindows(event, answered, minLen).map((w) => {
      const notes = notesFor(answered, w);
      return notes.length ? { ...w, notes } : w;
    });
    return { windows: partial, answered, pending };
  }

  const range = [{ start: event.dayStart, end: event.dayEnd }];
  for (const date of event.dates) {
    let common: Interval[] | null = range;
    for (const p of answered) {
      const own = mergeIntervals(p.slots.filter((s) => s.date === date));
      common = common === null ? own : intersectIntervals(common, own);
      if (common.length === 0) break;
    }
    for (const iv of common ?? []) {
      if (iv.end - iv.start < minLen) continue;
      const w: CommonWindow = { date, ...iv };
      const notes = notesFor(answered, w);
      windows.push(notes.length ? { ...w, notes } : w);
    }
  }
  return { windows, answered, pending };
}

/**
 * Partial attendance: a session is possible where everyone is free at the same
 * time for at least half the meetup (people may come late or leave early).
 * The window is exactly that overlap; people who cannot cover a full-length
 * session around it are listed in `partial`.
 */
function findPartialWindows(
  event: MeetEvent,
  answered: Participant[],
  minLen: number,
): CommonWindow[] {
  const windows: CommonWindow[] = [];
  const need = Math.max(30, Math.round(minLen / 2));
  const range = [{ start: event.dayStart, end: event.dayEnd }];
  for (const date of event.dates) {
    const byPerson = answered.map((p) => ({
      p,
      free: mergeIntervals(p.slots.filter((s) => s.date === date)),
    }));
    let common: Interval[] = range;
    for (const { free } of byPerson) {
      common = intersectIntervals(common, free);
      if (!common.length) break;
    }
    for (const iv of common) {
      if (iv.end - iv.start < need) continue;
      const partial = byPerson
        .filter(({ free }) => {
          // Their free block around the overlap must fit a full-length session.
          const own = free.find((f) => f.start <= iv.start && f.end >= iv.end);
          return !own || own.end - own.start < minLen;
        })
        .map(({ p }) => p.name);
      windows.push(partial.length ? { date, ...iv, partial } : { date, ...iv });
    }
  }
  return windows;
}

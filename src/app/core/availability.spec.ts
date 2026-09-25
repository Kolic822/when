import { describe, expect, it } from 'vitest';
import { findCommonWindows, intersectIntervals, mergeSlots } from './availability';
import { MeetEvent } from './models';

const base: MeetEvent = {
  id: 'x',
  title: 'Test',
  description: '',
  dates: ['2026-09-24', '2026-09-26'],
  durationHours: 3,
  dayStart: 0,
  dayEnd: 1440,
  partialOk: false,
  participants: [],
  history: [],
  createdAt: '',
};

describe('mergeSlots', () => {
  it('merges overlapping and touching slots per day', () => {
    const merged = mergeSlots([
      { date: '2026-09-24', start: 540, end: 720 },
      { date: '2026-09-24', start: 600, end: 780 },
      { date: '2026-09-24', start: 780, end: 840 },
      { date: '2026-09-26', start: 60, end: 120 },
    ]);
    expect(merged).toEqual([
      { date: '2026-09-24', start: 540, end: 840 },
      { date: '2026-09-26', start: 60, end: 120 },
    ]);
  });
});

describe('intersectIntervals', () => {
  it('returns the overlap of two interval lists', () => {
    expect(
      intersectIntervals(
        [
          { start: 0, end: 600 },
          { start: 700, end: 900 },
        ],
        [{ start: 500, end: 800 }],
      ),
    ).toEqual([
      { start: 500, end: 600 },
      { start: 700, end: 800 },
    ]);
  });
});

describe('findCommonWindows', () => {
  it('finds windows at least as long as the meetup where everyone who answered is free', () => {
    const result = findCommonWindows({
      ...base,
      participants: [
        {
          id: 'a',
          name: 'A',
          color: '#000',
          slots: [
            { date: '2026-09-24', start: 525, end: 705 },
            { date: '2026-09-26', start: 600, end: 1200 },
          ],
        },
        {
          id: 'b',
          name: 'B',
          color: '#111',
          slots: [
            { date: '2026-09-24', start: 510, end: 750 },
            { date: '2026-09-26', start: 1000, end: 1440 },
          ],
        },
        { id: 'c', name: 'C', color: '#222', slots: [] },
      ],
    });
    expect(result.windows).toEqual([
      { date: '2026-09-24', start: 525, end: 705 }, // exactly 3 h
      { date: '2026-09-26', start: 1000, end: 1200 }, // 3 h 20
    ]);
    expect(result.answered.map((p) => p.id)).toEqual(['a', 'b']);
    expect(result.pending.map((p) => p.id)).toEqual(['c']);
  });

  it('ignores days that are no longer part of the event', () => {
    const result = findCommonWindows({
      ...base,
      dates: ['2026-09-26'],
      participants: [
        { id: 'a', name: 'A', color: '#000', slots: [{ date: '2026-09-24', start: 0, end: 1440 }] },
        { id: 'b', name: 'B', color: '#111', slots: [{ date: '2026-09-24', start: 0, end: 1440 }] },
      ],
    });
    expect(result.windows).toEqual([]);
  });

  it('shows nothing until at least two people have answered', () => {
    const result = findCommonWindows({
      ...base,
      participants: [
        { id: 'a', name: 'A', color: '#000', slots: [{ date: '2026-09-24', start: 0, end: 1440 }] },
      ],
    });
    expect(result.windows).toEqual([]);
    expect(result.answered.length).toBe(1);
  });

  it('attaches notes from the periods that form a window', () => {
    const result = findCommonWindows({
      ...base,
      dates: ['2026-09-24'],
      participants: [
        {
          id: 'a',
          name: 'A',
          color: '#000',
          slots: [{ date: '2026-09-24', start: 600, end: 900, note: 'leaving 20 min early' }],
        },
        {
          id: 'b',
          name: 'B',
          color: '#111',
          slots: [{ date: '2026-09-24', start: 600, end: 900 }],
        },
      ],
    });
    expect(result.windows).toEqual([
      {
        date: '2026-09-24',
        start: 600,
        end: 900,
        notes: [{ name: 'A', note: 'leaving 20 min early' }],
      },
    ]);
  });
});

describe('findCommonWindows with a time range', () => {
  it('only counts overlap inside the organiser range', () => {
    const result = findCommonWindows({
      ...base,
      dates: ['2026-09-24'],
      dayStart: 480,
      dayEnd: 1380,
      durationHours: 2,
      participants: [
        { id: 'a', name: 'A', color: '#000', slots: [{ date: '2026-09-24', start: 0, end: 600 }] },
        {
          id: 'b',
          name: 'B',
          color: '#111',
          slots: [{ date: '2026-09-24', start: 300, end: 1440 }],
        },
      ],
    });
    expect(result.windows).toEqual([{ date: '2026-09-24', start: 480, end: 600 }]);
  });
});

describe('findCommonWindows with partial attendance', () => {
  it('uses the real overlap when it covers at least half the meetup, naming who is only partly free', () => {
    const result = findCommonWindows({
      ...base,
      dates: ['2026-09-25'],
      dayStart: 480,
      dayEnd: 1380,
      durationHours: 3,
      partialOk: true,
      participants: [
        {
          id: 'a',
          name: 'A',
          color: '#000',
          slots: [{ date: '2026-09-25', start: 1020, end: 1380 }],
        }, // 17–23
        {
          id: 'b',
          name: 'B',
          color: '#111',
          slots: [{ date: '2026-09-25', start: 1080, end: 1200 }],
        }, // 18–20 only
      ],
    });
    // Overlap 18–20 (2 h ≥ half of 3 h). B's block is shorter than 3 h, so B is only partly there.
    expect(result.windows).toEqual([
      { date: '2026-09-25', start: 1080, end: 1200, partial: ['B'] },
    ]);
  });

  it('ignores overlaps shorter than half the meetup', () => {
    const result = findCommonWindows({
      ...base,
      dates: ['2026-09-25'],
      dayStart: 480,
      dayEnd: 1380,
      durationHours: 2,
      partialOk: true,
      participants: [
        {
          id: 'a',
          name: 'A',
          color: '#000',
          slots: [{ date: '2026-09-25', start: 480, end: 930 }],
        }, // 08:00–15:30
        {
          id: 'b',
          name: 'B',
          color: '#111',
          slots: [{ date: '2026-09-25', start: 915, end: 1365 }],
        }, // 15:15–22:45
      ],
    });
    expect(result.windows).toEqual([]);
  });
});

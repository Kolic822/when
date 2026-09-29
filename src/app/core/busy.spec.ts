import { freeAround } from './busy';

describe('freeAround', () => {
  const day = [8 * 60, 23 * 60] as const;

  it('returns the whole day when the calendar is empty', () => {
    expect(freeAround([], ...day, 120)).toEqual([{ start: 480, end: 1380 }]);
  });

  it('returns the gaps around events', () => {
    const busy = [
      { start: 9 * 60, end: 17 * 60 },
      { start: 18 * 60 + 30, end: 19 * 60 + 30 },
    ];
    expect(freeAround(busy, ...day, 60)).toEqual([
      { start: 480, end: 540 },
      { start: 1020, end: 1110 },
      { start: 1170, end: 1380 },
    ]);
  });

  it('leaves out gaps shorter than the meetup', () => {
    const busy = [
      { start: 9 * 60, end: 17 * 60 },
      { start: 18 * 60 + 30, end: 19 * 60 + 30 },
    ];
    expect(freeAround(busy, ...day, 120)).toEqual([{ start: 1170, end: 1380 }]);
  });

  it('merges overlapping events and ignores ones outside the day', () => {
    const busy = [
      { start: 6 * 60, end: 7 * 60 },
      { start: 10 * 60, end: 12 * 60 },
      { start: 11 * 60, end: 13 * 60 },
    ];
    expect(freeAround(busy, ...day, 60)).toEqual([
      { start: 480, end: 600 },
      { start: 780, end: 1380 },
    ]);
  });

  it('keeps a buffer around events and snaps to quarter hours', () => {
    const busy = [{ start: 12 * 60 + 10, end: 13 * 60 + 5 }];
    expect(freeAround(busy, ...day, 60, 15)).toEqual([
      { start: 480, end: 705 },
      { start: 810, end: 1380 },
    ]);
  });
});

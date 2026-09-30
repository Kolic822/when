import { byDay } from './calendar-link';

describe('busy times from a calendar', () => {
  const days = new Set(['2026-10-05', '2026-10-06']);

  it('places an event on its day in the zone of the When', () => {
    // 09:00–10:30 in Zagreb (UTC+2 in October)
    const out = byDay(
      [{ start: '2026-10-05T07:00:00Z', end: '2026-10-05T08:30:00Z' }],
      'Europe/Zagreb',
      days,
    );
    expect(out['2026-10-05']).toEqual([{ start: 540, end: 630, title: 'Busy' }]);
  });

  it('splits an event that runs past midnight', () => {
    // 22:00 on the 5th to 01:00 on the 6th in Zagreb
    const out = byDay(
      [{ start: '2026-10-05T20:00:00Z', end: '2026-10-05T23:00:00Z' }],
      'Europe/Zagreb',
      days,
    );
    expect(out['2026-10-05']).toEqual([{ start: 1320, end: 1440, title: 'Busy' }]);
    expect(out['2026-10-06']).toEqual([{ start: 0, end: 60, title: 'Busy' }]);
  });

  it('ignores days that are not part of the When', () => {
    const out = byDay(
      [{ start: '2026-10-08T07:00:00Z', end: '2026-10-08T08:00:00Z' }],
      'Europe/Zagreb',
      days,
    );
    expect(out).toEqual({});
  });

  it('uses the zone it is given', () => {
    // The same moment is 03:00–04:30 in New York
    const out = byDay(
      [{ start: '2026-10-05T07:00:00Z', end: '2026-10-05T08:30:00Z' }],
      'America/New_York',
      days,
    );
    expect(out['2026-10-05']).toEqual([{ start: 180, end: 270, title: 'Busy' }]);
  });
});

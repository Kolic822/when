import { byDay } from './calendar-link';

describe('calendar events by day', () => {
  const days = new Set(['2026-10-05', '2026-10-06']);
  const timed = (start: string, end: string, summary = 'Work') => ({
    summary,
    start: { dateTime: start },
    end: { dateTime: end },
  });

  it('places an event on its day in the zone of the When, with its name', () => {
    // 09:00–10:30 in Zagreb (UTC+2 in October)
    const out = byDay(
      [timed('2026-10-05T07:00:00Z', '2026-10-05T08:30:00Z')],
      'Europe/Zagreb',
      days,
    );
    expect(out.timed['2026-10-05']).toEqual([{ start: 540, end: 630, title: 'Work' }]);
  });

  it('splits an event that runs past midnight', () => {
    // 22:00 on the 5th to 01:00 on the 6th in Zagreb
    const out = byDay(
      [timed('2026-10-05T20:00:00Z', '2026-10-05T23:00:00Z')],
      'Europe/Zagreb',
      days,
    );
    expect(out.timed['2026-10-05']).toEqual([{ start: 1320, end: 1440, title: 'Work' }]);
    expect(out.timed['2026-10-06']).toEqual([{ start: 0, end: 60, title: 'Work' }]);
  });

  it('ignores days that are not part of the When', () => {
    const out = byDay(
      [timed('2026-10-08T07:00:00Z', '2026-10-08T08:00:00Z')],
      'Europe/Zagreb',
      days,
    );
    expect(out.timed).toEqual({});
  });

  it('uses the zone it is given', () => {
    // The same moment is 03:00–04:30 in New York
    const out = byDay(
      [timed('2026-10-05T07:00:00Z', '2026-10-05T08:30:00Z')],
      'America/New_York',
      days,
    );
    expect(out.timed['2026-10-05']).toEqual([{ start: 180, end: 270, title: 'Work' }]);
  });

  it('keeps all-day events apart, on every day they cover', () => {
    const out = byDay(
      [{ summary: 'Trip', start: { date: '2026-10-04' }, end: { date: '2026-10-07' } }],
      'Europe/Zagreb',
      days,
    );
    expect(out.allDay).toEqual({ '2026-10-05': ['Trip'], '2026-10-06': ['Trip'] });
    expect(out.timed).toEqual({});
  });

  it('skips cancelled events and names untitled ones', () => {
    const out = byDay(
      [
        { ...timed('2026-10-05T07:00:00Z', '2026-10-05T08:00:00Z'), status: 'cancelled' },
        { start: { dateTime: '2026-10-05T10:00:00Z' }, end: { dateTime: '2026-10-05T11:00:00Z' } },
      ],
      'Europe/Zagreb',
      days,
    );
    expect(out.timed['2026-10-05']).toEqual([{ start: 720, end: 780, title: 'Busy' }]);
  });
});

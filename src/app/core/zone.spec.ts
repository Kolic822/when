import {
  dayOf,
  eventZone,
  setZoneMode,
  setZoneOverride,
  spanAt,
  timeAt,
  toUtc,
  zoneDiffers,
  zoneOffset,
} from './zone';

describe('time zones', () => {
  beforeEach(() => {
    eventZone.set('Europe/Zagreb');
    setZoneMode('mine');
  });
  afterEach(() => {
    eventZone.set(null);
    setZoneOverride(null);
    setZoneMode('mine');
  });

  it('knows offsets, including daylight saving', () => {
    expect(zoneOffset('Europe/Zagreb', '2026-10-05')).toBe(120);
    expect(zoneOffset('Europe/Zagreb', '2026-12-05')).toBe(60);
    expect(zoneOffset('America/New_York', '2026-10-05')).toBe(-240);
    expect(zoneOffset('Asia/Kolkata', '2026-10-05')).toBe(330);
  });

  it('leaves times alone for someone in the same zone', () => {
    setZoneOverride('Europe/Zagreb');
    expect(timeAt('2026-10-05', 19 * 60)).toBe('19:00');
    expect(spanAt('2026-10-05', 600, 1440)).toBe('10:00 – 24:00');
    expect(zoneDiffers(['2026-10-05'])).toBe(false);
  });

  it('converts to a zone behind', () => {
    setZoneOverride('America/New_York');
    expect(zoneDiffers(['2026-10-05'])).toBe(true);
    expect(timeAt('2026-10-05', 19 * 60)).toBe('13:00');
    expect(spanAt('2026-10-05', 19 * 60, 21 * 60)).toBe('13:00 – 15:00');
    // 03:00 in Zagreb is still the evening before in New York.
    expect(timeAt('2026-10-05', 3 * 60)).toBe('21:00⁻¹');
    expect(dayOf('2026-10-05', 3 * 60)).toBe('2026-10-04');
  });

  it('converts to a zone ahead, across midnight', () => {
    setZoneOverride('Asia/Tokyo');
    expect(timeAt('2026-10-05', 19 * 60)).toBe('02:00⁺¹');
    expect(dayOf('2026-10-05', 19 * 60)).toBe('2026-10-06');
    expect(spanAt('2026-10-05', 15 * 60, 19 * 60)).toBe('22:00 – 02:00⁺¹');
    expect(spanAt('2026-10-05', 19 * 60, 21 * 60)).toBe('02:00 – 04:00');
  });

  it('follows the weeks when Europe and the US change clocks on different dates', () => {
    setZoneOverride('America/New_York');
    expect(timeAt('2026-10-20', 19 * 60)).toBe('13:00'); // 6 h apart
    expect(timeAt('2026-10-27', 19 * 60)).toBe('14:00'); // Europe already changed: 5 h
    expect(timeAt('2026-11-03', 19 * 60)).toBe('13:00'); // both changed: 6 h again
  });

  it('shows event time on request', () => {
    setZoneOverride('America/New_York');
    setZoneMode('event');
    expect(timeAt('2026-10-05', 19 * 60)).toBe('19:00');
  });

  it('gives the absolute moment for calendar files', () => {
    expect(toUtc('2026-10-05', 19 * 60).toISOString()).toBe('2026-10-05T17:00:00.000Z');
    expect(toUtc('2026-12-05', 19 * 60).toISOString()).toBe('2026-12-05T18:00:00.000Z');
  });
});

import { Component, computed, inject, input, output, signal } from '@angular/core';

import { CalendarLink } from '../../core/calendar-link';

import { PrefsStore } from '../../core/prefs';

import { MatButtonModule } from '@angular/material/button';

import { MatIconModule } from '@angular/material/icon';

import { CommonWindow, MeetEvent, Participant, Slot } from '../../core/models';

import {
  dateStyle,
  dayMonth,
  fromDateKey,
  toDateKey,
  weekdayLong,
  weekdayShort,
  monthShort,
} from '../../core/time';

import { spanAt, timeAt } from '../../core/zone';

import { t } from '../../core/i18n/i18n';

const LONG_PRESS_MS = 500;
/** At most this many days are visible at once; more scroll sideways. */
const MAX_VISIBLE = 5;

interface Block {
  top: number; // percent
  height: number; // percent
  label: string;
  /** Start of the window in minutes (gold bands only). */
  start?: number;
  /** Start/end text drawn inside gold bands that are tall enough. */
  from?: string;
  to?: string;
}

interface DayColumn {
  key: string;
  weekday: string;
  dayNum: number;
  month: string;
  /** "30.9." – used when dates are written with numbers. */
  dateText: string;
  today: boolean;
  label: string;
  longLabel: string;
  /** participantId -> that person's blocks on this day */
  blocks: Record<string, Block[]>;
  common: Block[];
  /** Own calendar events behind the lanes. */
  busy: Block[];
  /** What someone chose through an "Ask someone" link. */
  picked: Block[];
  hasMine: boolean;
  allDay: boolean;
}

/**
 * Overview: one column per day, hours down the side, one coloured lane per
 * person. Gold stripes mark windows where everyone fits the meetup.
 */
@Component({
  selector: 'app-week-chart',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './week-chart.html',
  styleUrl: './week-chart.scss',
})
export class WeekChart {
  readonly t = t;
  private readonly prefs = inject(PrefsStore);
  private readonly calendar = inject(CalendarLink);
  readonly showBusy = computed(() => this.prefs.prefs().features.connect);

  readonly event = input.required<MeetEvent>();
  readonly meId = input<string | null>(null);
  readonly windows = input<CommonWindow[]>([]);
  /** Person to emphasise (others fade), e.g. while hovering a legend chip. */
  readonly highlightId = input<string | null>(null);
  /** The organiser can tap a gold band to book that session. */
  readonly organiser = input(false);
  readonly sessionSelected = output<{ date: string; start: number }>();
  /** Window chosen through an "Ask someone" link, with who chose it. */
  readonly picked = input<{ date: string; start: number; end: number; label: string } | null>(null);
  readonly daySelected = output<string>();
  readonly allDayToggled = output<{ date: string; on: boolean }>();
  readonly dayCleared = output<string>();

  readonly range = computed(() => {
    const { dayStart, dayEnd } = this.event();
    return { start: dayStart, end: dayEnd, hours: (dayEnd - dayStart) / 60 };
  });

  /** Only the first and last hour are labelled; the gold bands carry the exact times. */
  readonly hours = computed(() => {
    const { start, end } = this.range();
    return [
      { min: start, label: timeAt(this.event().dates[0], start), top: 0, edge: 'first' },
      { min: end, label: timeAt(this.event().dates[0], end), top: 100, edge: 'last' },
    ];
  });

  /** Lanes in legend order, with the current user always on the right. */
  readonly participants = computed<Participant[]>(() => {
    const me = this.meId();
    const all = this.event().participants;
    return [...all.filter((p) => p.id !== me), ...all.filter((p) => p.id === me)];
  });
  readonly numericDates = computed(() => dateStyle() === 'numeric');
  /** Month name under the day number, whenever dates are written with names ("30 Sep"). */
  readonly showMonth = computed(() => !this.numericDates());

  /** Day whose "all day" was just toggled, so its blocks glide instead of jumping. */
  readonly morphDay = signal<string | null>(null);
  private morphTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Many days: optionally hide the ones nobody has marked.
  readonly visibleDates = computed(() => this.event().dates);
  /** Columns sharing the width at once (the rest scroll). */
  readonly visibleCount = computed(() => Math.min(MAX_VISIBLE, this.visibleDates().length));
  /** More days than fit: show a scroll hint until the user reaches the end. */
  readonly overflows = computed(() => this.visibleDates().length > MAX_VISIBLE);
  readonly scrolledToEnd = signal(false);

  onChartScroll(e: Event): void {
    const el = e.target as HTMLElement;
    this.scrolledToEnd.set(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }

  readonly days = computed<DayColumn[]>(() => {
    const ev = this.event();
    const today = toDateKey(new Date());
    const me = ev.participants.find((p) => p.id === this.meId()) ?? null;
    return this.visibleDates().map((key) => {
      const d = fromDateKey(key);
      const mySlots = (me?.slots ?? []).filter((s) => s.date === key);
      const blocks: Record<string, Block[]> = {};
      for (const p of ev.participants) blocks[p.id] = this.blocksOf(p, key);
      return {
        key,
        weekday: weekdayShort(key),
        dayNum: d.getDate(),
        month: monthShort(d),
        dateText: `${d.getDate()}.${d.getMonth() + 1}.`,
        today: key === today,
        label: t('{day} – tap to mark when you’re free, hold to clear', {
          day: `${weekdayLong(key)} ${dayMonth(key)}`,
        }),
        longLabel: `${weekdayLong(key)} ${dayMonth(key)}`,
        blocks,
        picked:
          this.picked()?.date === key
            ? [this.block(this.picked()!.start, this.picked()!.end, this.picked()!.label)]
            : [],
        busy: this.showBusy()
          ? this.calendar
              .busyOn(key, ev.dayStart, ev.dayEnd)
              .map((b) => this.block(b.start, b.end, b.title))
          : [],
        common: this.windows()
          .filter((w) => w.date === key)
          .map((w) => ({
            ...this.block(
              w.start,
              w.end,
              t('Everyone can make it {time}', { time: spanAt(w.date, w.start, w.end) }),
            ),
            start: w.start,
            ...(w.end - w.start >= 90
              ? { from: timeAt(w.date, w.start), to: timeAt(w.date, w.end) }
              : {}),
          })),
        hasMine: mySlots.length > 0,
        allDay:
          mySlots.length === 1 && mySlots[0].start <= ev.dayStart && mySlots[0].end >= ev.dayEnd,
      };
    });
  });

  toggleAllDay(day: DayColumn): void {
    this.morphDay.set(day.key);
    if (this.morphTimer) clearTimeout(this.morphTimer);
    this.morphTimer = setTimeout(() => this.morphDay.set(null), 500);
    this.allDayToggled.emit({ date: day.key, on: !day.allDay });
  }

  // ---- Long-press on a day column offers to clear it.
  readonly confirmClear = signal<DayColumn | null>(null);
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressStart: { x: number; y: number } | null = null;
  private suppressClick = false;

  onPressStart(day: DayColumn, e: PointerEvent): void {
    if (e.button !== 0 || !day.hasMine) return;
    this.pressStart = { x: e.clientX, y: e.clientY };
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      this.suppressClick = true;
      navigator.vibrate?.(15);
      this.confirmClear.set(day);
    }, LONG_PRESS_MS);
  }

  onPressMove(e: PointerEvent): void {
    if (!this.pressStart || !this.pressTimer) return;
    if (Math.abs(e.clientX - this.pressStart.x) > 8 || Math.abs(e.clientY - this.pressStart.y) > 8)
      this.onPressEnd();
  }

  onPressEnd(): void {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
    this.pressStart = null;
  }

  onOpenClick(day: DayColumn): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.daySelected.emit(day.key);
  }

  /** Organiser tapped a gold band: go and book it instead of opening the day. */
  onBandClick(day: DayColumn, band: Block, e: Event): void {
    if (!this.organiser() || band.start === undefined) return;
    e.stopPropagation();
    this.sessionSelected.emit({ date: day.key, start: band.start });
  }

  clearConfirmed(day: DayColumn): void {
    this.confirmClear.set(null);
    this.dayCleared.emit(day.key);
  }

  // ---- Geometry
  private pct(min: number): number {
    const { start, end } = this.range();
    return ((min - start) / (end - start)) * 100;
  }

  private block(start: number, end: number, label: string): Block {
    const { start: s, end: e } = this.range();
    const a = Math.max(start, s);
    const b = Math.min(end, e);
    return { top: this.pct(a), height: Math.max(0, this.pct(b) - this.pct(a)), label };
  }

  private blocksOf(p: Participant, date: string): Block[] {
    return p.slots
      .filter((s: Slot) => s.date === date)
      .map((s) =>
        this.block(
          s.start,
          s.end,
          `${p.name} ${spanAt(date, s.start, s.end)}${s.note ? ' – ' + s.note : ''}`,
        ),
      );
  }
}

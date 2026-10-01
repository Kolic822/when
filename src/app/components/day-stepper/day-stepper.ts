import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { MatButtonModule } from '@angular/material/button';

import { MatIconModule } from '@angular/material/icon';

import { mergeSlots } from '../../core/availability';

import { freeAround } from '../../core/busy';

import { CalendarLink } from '../../core/calendar-link';

import { MeetEvent, Slot } from '../../core/models';

import { PrefsStore } from '../../core/prefs';

import { dayMonth, shortDate, weekdayLong } from '../../core/time';

import { timeAt } from '../../core/zone';

import { DayEditor } from '../day-editor/day-editor';

import { t } from '../../core/i18n/i18n';

/**
 * Guided first pass: one day at a time with "Free all day" / "Not free" shortcuts,
 * the drag editor underneath, and Next/Finish. "See all days" leaves for the overview.
 */
@Component({
  selector: 'app-day-stepper',
  imports: [MatButtonModule, MatIconModule, DayEditor],
  templateUrl: './day-stepper.html',
  styleUrl: './day-stepper.scss',
})
export class DayStepper {
  readonly t = t;
  readonly event = input.required<MeetEvent>();
  readonly meId = input.required<string>();
  /** Day to open first (when a day was tapped in the overview). */
  readonly startDate = input<string | null>(null);
  readonly slotsChange = output<Slot[]>();
  readonly allDayToggled = output<{ date: string; on: boolean }>();
  readonly notFree = output<string>();
  /** Quick actions from the two big buttons (the parent confirms them with an Undo toast). */
  readonly quickFree = output<string>();
  /** Copy this day's times to the given other days. */
  readonly copyTo = output<{ from: string; to: string[] }>();
  readonly copySlotTo = output<{ slot: Slot; to: string[] }>();
  /** Emitted when the user finishes the last day or asks to see all days. */
  readonly finished = output<void>();

  readonly index = signal(0);

  constructor() {
    // Only the start date drives this; event updates must not reset the position.
    effect(() => {
      const d = this.startDate();
      untracked(() => {
        const i = d ? this.event().dates.indexOf(d) : -1;
        if (i >= 0) this.index.set(i);
      });
    });
  }
  /** What the side-column day picker is copying: the whole day or one period. */
  readonly copyTarget = signal<{ kind: 'day' } | { kind: 'slot'; slot: Slot } | null>(null);

  slotLabel(s: Slot): string {
    return `${timeAt(s.date, s.start)} – ${timeAt(s.date, s.end)}`;
  }

  // ---- Copy mode: pick target days in the side panel, confirm with the bottom buttons.
  readonly chosen = signal<Set<string>>(new Set());
  readonly otherDates = computed(() => this.dates().filter((d) => d !== this.date()));
  readonly allChosen = computed(() => this.otherDates().every((d) => this.chosen().has(d)));

  shortLabel(date: string): string {
    return shortDate(date).split(' ').slice(0, 2).join(' ');
  }

  startCopy(target: { kind: 'day' } | { kind: 'slot'; slot: Slot }): void {
    this.chosen.set(new Set());
    this.copyTarget.set(target);
  }

  toggleDay(date: string): void {
    this.chosen.update((set) => {
      const next = new Set(set);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }

  toggleAll(): void {
    this.chosen.set(this.allChosen() ? new Set() : new Set(this.otherDates()));
  }

  cancelCopy(): void {
    this.copyTarget.set(null);
  }

  applyCopy(): void {
    const target = this.copyTarget();
    const to = [...this.chosen()];
    this.copyTarget.set(null);
    if (!target || !to.length) return;
    if (target.kind === 'slot') this.copySlotTo.emit({ slot: target.slot, to });
    else this.copyToDays(to);
  }
  readonly dates = computed(() => this.event().dates);
  readonly date = computed(() => this.dates()[Math.min(this.index(), this.dates().length - 1)]);
  readonly isLast = computed(() => this.index() >= this.dates().length - 1);
  readonly dayLabel = computed(() => `${weekdayLong(this.date())} ${dayMonth(this.date())}`);

  readonly hasTimes = computed(() => {
    const me = this.event().participants.find((p) => p.id === this.meId());
    return !!me?.slots.some((s) => s.date === this.date());
  });
  readonly isAllDay = computed(() => {
    const ev = this.event();
    const today = (ev.participants.find((p) => p.id === this.meId())?.slots ?? []).filter(
      (s) => s.date === this.date(),
    );
    return today.length === 1 && today[0].start <= ev.dayStart && today[0].end >= ev.dayEnd;
  });

  copyToDays(to: string[]): void {
    this.copyTo.emit({ from: this.date(), to });
    // Continue with the first day that still has nothing.
    const me = this.event().participants.find((p) => p.id === this.meId());
    const filled = new Set([...(me?.slots.map((s) => s.date) ?? []), this.date(), ...to]);
    const nextEmpty = this.dates().findIndex((d, i) => i > this.index() && !filled.has(d));
    if (nextEmpty === -1) this.finished.emit();
    else {
      this.index.set(nextEmpty);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  clearDay(): void {
    if (this.hasTimes()) this.notFree.emit(this.date());
  }

  /** Toggles: a second tap switches "all day" off and brings back the earlier times. */
  freeAllDay(): void {
    if (this.isAllDay()) this.allDayToggled.emit({ date: this.date(), on: false });
    else this.quickFree.emit(this.date());
  }

  // ---- Own calendar (Pro)
  private readonly prefs = inject(PrefsStore);
  readonly calendar = inject(CalendarLink);
  readonly calendarOffered = computed(() => this.prefs.prefs().features.connect);
  readonly calendarShown = computed(() => this.prefs.prefs().calendarInDay);
  /** Said for a moment when the calendar leaves no room on this day. */
  readonly fillNote = signal(false);
  private fillNoteTimer: ReturnType<typeof setTimeout> | null = null;

  readonly settings = computed(() => this.prefs.prefs());

  /** Which calendar the events come from, as a heading for its switches. */
  readonly calendarLabel = computed(() => {
    const links = this.calendar.links();
    const google = this.calendar.connected();
    if (google && !links.length) return 'Google';
    const hosts = links.map((l) => {
      try {
        return new URL(l).hostname;
      } catch {
        return '';
      }
    });
    if (!google && hosts.every((h) => h.endsWith('icloud.com'))) return 'iCloud';
    if (!google && hosts.every((h) => /outlook|live\.com|office/.test(h))) return 'Outlook';
    return t('Calendar');
  });

  toggleSetting(key: 'calendarNames' | 'calendarAllDay'): void {
    this.prefs.update({ [key]: !this.settings()[key] });
  }

  toggleCalendar(): void {
    this.prefs.update({ calendarInDay: !this.calendarShown() });
  }

  /**
   * Marks this day free wherever the calendar has nothing: the gaps around its events
   * that are long enough for the meetup. Times already marked are kept.
   */
  fillFromCalendar(): void {
    const ev = this.event();
    const date = this.date();
    // Show what the times are worked out from.
    if (!this.calendarShown()) this.prefs.update({ calendarInDay: true });
    const minLength = ev.partialOk ? 15 : ev.durationHours * 60;
    const busy = this.calendar.busyOn(date, ev.dayStart, ev.dayEnd);
    const gaps = freeAround(busy, ev.dayStart, ev.dayEnd, minLength);
    if (this.fillNoteTimer) clearTimeout(this.fillNoteTimer);
    this.fillNote.set(!gaps.length);
    if (!gaps.length) {
      this.fillNoteTimer = setTimeout(() => this.fillNote.set(false), 4000);
      return;
    }
    const mine = ev.participants.find((p) => p.id === this.meId())?.slots ?? [];
    this.slotsChange.emit(mergeSlots([...mine, ...gaps.map((gap) => ({ date, ...gap }))]));
  }

  next(): void {
    this.copyTarget.set(null);
    if (this.isLast()) {
      this.finished.emit();
      return;
    }
    this.index.update((i) => i + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  prev(): void {
    if (this.index() === 0) return;
    this.index.update((i) => i - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

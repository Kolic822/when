import { Component, computed, model, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  addDays,
  dateRange,
  fromDateKey,
  monthLong,
  monthShort,
  startOfWeek,
  toDateKey,
} from '../../core/time';
import { t, m } from '../../core/i18n/i18n';

interface Cell {
  key: string;
  day: number;
  month: string;
  past: boolean;
  today: boolean;
}

/**
 * Month calendar where the organiser taps the days that should be up for
 * selection. Any number of days, consecutive or not.
 */
const WEEKS = 5;

@Component({
  selector: 'app-day-picker',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './day-picker.html',
  styleUrl: './day-picker.scss',
})
export class DayPicker {
  readonly t = t;
  /** Sorted list of selected YYYY-MM-DD keys. */
  readonly selected = model<string[]>([]);

  readonly today = toDateKey(new Date());
  private readonly thisWeek = startOfWeek(this.today);

  /** Monday of the first week shown. The view rolls forward from this week; the past is never shown. */
  readonly start = signal(this.thisWeek);
  readonly atStart = computed(() => this.start() <= this.thisWeek);

  /** "October 2026", or "Sep – Oct 2026" when the weeks shown span two months. */
  readonly monthLabel = computed(() => {
    const from = fromDateKey(this.start());
    // Named after the first four weeks; a lone day of a third month doesn't rename the view.
    const to = fromDateKey(addDays(this.start(), 27));
    if (from.getMonth() === to.getMonth()) return `${monthLong(from)} ${from.getFullYear()}`;
    const year = from.getFullYear() === to.getFullYear() ? '' : ` ${from.getFullYear()}`;
    return `${monthShort(from)}${year} – ${monthShort(to)} ${to.getFullYear()}`;
  });

  readonly weekdays = [m('Mo'), m('Tu'), m('We'), m('Th'), m('Fr'), m('Sa'), m('Su')];

  readonly cells = computed<Cell[]>(() =>
    dateRange(this.start(), WEEKS * 7).map((key) => {
      const d = fromDateKey(key);
      return {
        key,
        day: d.getDate(),
        // The first of a month carries its name, so the change of month is easy to spot.
        month: d.getDate() === 1 ? monthShort(d) : '',
        past: key < this.today,
        today: key === this.today,
      };
    }),
  );

  readonly selectedSet = computed(() => new Set(this.selected()));

  readonly shortcuts = [
    { label: m('This week'), days: dateRange(this.thisWeek, 7).filter((d) => d >= this.today) },
    { label: m('Next week'), days: dateRange(addDays(this.thisWeek, 7), 7) },
    {
      label: m('Weekends'),
      days: dateRange(this.thisWeek, 28).filter(
        (d) => d >= this.today && [0, 6].includes(fromDateKey(d).getDay()),
      ),
    },
  ];

  isSelected(key: string): boolean {
    return this.selectedSet().has(key);
  }

  toggle(cell: Cell): void {
    if (cell.past) return;
    const set = new Set(this.selected());
    if (set.has(cell.key)) set.delete(cell.key);
    else set.add(cell.key);
    this.selected.set([...set].sort());
  }

  /** Adds the shortcut's days, or removes them if they are all selected already. */
  applyShortcut(days: string[]): void {
    const set = new Set(this.selected());
    const allIn = days.every((d) => set.has(d));
    for (const d of days) allIn ? set.delete(d) : set.add(d);
    this.selected.set([...set].sort());
    if (days.length) this.show(days[0]);
  }

  shortcutActive(days: string[]): boolean {
    const set = this.selectedSet();
    return days.length > 0 && days.every((d) => set.has(d));
  }

  clear(): void {
    this.selected.set([]);
  }

  /** Moves the view four weeks back or forward, never before this week. */
  shift(direction: -1 | 1): void {
    this.show(addDays(this.start(), direction * 28));
  }

  goToday(): void {
    this.start.set(this.thisWeek);
  }

  /** Brings a day into view if it isn't already. */
  private show(key: string): void {
    const end = addDays(this.start(), WEEKS * 7 - 1);
    if (key >= this.start() && key <= end && key >= this.thisWeek) return;
    const week = startOfWeek(key);
    this.start.set(week < this.thisWeek ? this.thisWeek : week);
  }
}

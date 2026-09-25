import { Component, computed, model, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { addDays, dateRange, fromDateKey, startOfWeek, toDateKey } from '../../core/time';

interface Cell {
  key: string;
  day: number;
  inMonth: boolean;
  past: boolean;
  today: boolean;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Month calendar where the organiser taps the days that should be up for
 * selection. Any number of days, consecutive or not.
 */
@Component({
  selector: 'app-day-picker',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './day-picker.html',
  styleUrl: './day-picker.scss',
})
export class DayPicker {
  /** Sorted list of selected YYYY-MM-DD keys. */
  readonly selected = model<string[]>([]);

  readonly today = toDateKey(new Date());
  private readonly thisWeek = startOfWeek(this.today);

  /** First day of the displayed month. */
  readonly month = signal(this.today.slice(0, 7) + '-01');

  readonly monthLabel = computed(() => {
    const d = fromDateKey(this.month());
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  });

  readonly weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  readonly cells = computed<Cell[]>(() => {
    const first = this.month();
    const gridStart = startOfWeek(first);
    const monthPrefix = first.slice(0, 7);
    return dateRange(gridStart, 42).map((key) => ({
      key,
      day: fromDateKey(key).getDate(),
      inMonth: key.startsWith(monthPrefix),
      past: key < this.today,
      today: key === this.today,
    }));
  });

  readonly selectedSet = computed(() => new Set(this.selected()));

  readonly shortcuts = [
    { label: 'This week', days: dateRange(this.thisWeek, 7).filter((d) => d >= this.today) },
    { label: 'Next week', days: dateRange(addDays(this.thisWeek, 7), 7) },
    {
      label: 'Weekends',
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
    if (days.length) this.month.set(days[0].slice(0, 7) + '-01');
  }

  shortcutActive(days: string[]): boolean {
    const set = this.selectedSet();
    return days.length > 0 && days.every((d) => set.has(d));
  }

  clear(): void {
    this.selected.set([]);
  }

  shiftMonth(delta: number): void {
    const d = fromDateKey(this.month());
    d.setMonth(d.getMonth() + delta, 1);
    this.month.set(toDateKey(d).slice(0, 7) + '-01');
  }

  goToday(): void {
    this.month.set(this.today.slice(0, 7) + '-01');
  }
}

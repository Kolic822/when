import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AvailabilityResult } from '../../core/availability';
import { buildIcs, openInCalendar } from '../../core/calendar';
import { CommonWindow, Session, Shortlist } from '../../core/models';
import { Features, NO_FEATURES } from '../../core/prefs';
import { formatDuration, formatMinutes, shortDate } from '../../core/time';
import { AskPanel } from '../ask-panel/ask-panel';

interface Row {
  key: string;
  day: string;
  time: string;
  length: string;
  /** People who can't stay for the whole meetup (partial-attendance mode). */
  partial: string;
  notes: { name: string; note: string }[];
  window: CommonWindow;
  /** Start times the organiser can book inside this window. */
  starts: number[];
  /** Whether tapping the row reveals anything (notes, booking, calendar). */
  expandable: boolean;
}

interface AskedRow {
  text: string;
  /** Who said yes, with the window they chose inside the session, if any. */
  yes: { name: string; at: string }[];
}

interface Asked {
  id: string;
  url: string;
  mode: 'one' | 'many';
  rows: AskedRow[];
  none: string[];
  answered: number;
}

const COLLAPSED_ROWS = 3;

/** Compact list of possible sessions, with the Pro extras when they are switched on. */
@Component({
  selector: 'app-results',
  imports: [MatButtonModule, MatIconModule, AskPanel],
  templateUrl: './results.html',
  styleUrl: './results.scss',
})
export class Results {
  readonly result = input.required<AvailabilityResult>();
  readonly durationHours = input.required<number>();
  readonly partialOk = input(false);
  readonly features = input<Features>(NO_FEATURES);
  readonly organiser = input(false);
  readonly eventId = input('');
  readonly title = input('Meetup');
  readonly description = input('');
  readonly url = input('');
  readonly shortlists = input<Shortlist[]>([]);
  /** A session is already booked, so the list starts folded away. */
  readonly booked = input(false);

  /** The organiser settles on a session. */
  readonly book = output<Session>();

  readonly collapsedRows = COLLAPSED_ROWS;

  /** Whole card folded to one line; null follows the default (folded once booked). */
  private readonly folded = signal<boolean | null>(null);
  readonly isFolded = computed(() => this.folded() ?? this.booked());
  readonly expanded = signal(false);
  /** Row the organiser is choosing a start time for, before booking. */
  readonly selecting = signal<string | null>(null);
  /** Row whose details are open. */
  readonly openRow = signal<string | null>(null);
  /** Start the organiser picked per row; defaults to the start of the window. */
  private readonly pickedStart = signal<Record<string, number>>({});
  readonly asking = signal(false);
  readonly copied = signal<string | null>(null);

  readonly minutes = computed(() => Math.round(this.durationHours() * 60));
  readonly durationLabel = computed(() => formatDuration(this.minutes()));

  /** In date order; the app doesn't rank them, the organiser decides. */
  readonly rows = computed<Row[]>(() => {
    const ordered = [...this.result().windows].sort(
      (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
    );
    return ordered.map((w) => ({
      key: `${w.date}-${w.start}`,
      day: shortDate(w.date),
      time: `${formatMinutes(w.start)} – ${formatMinutes(w.end)}`,
      length: formatDuration(w.end - w.start),
      partial: w.partial?.length
        ? `${w.partial.join(', ')} can't stay the full ${this.durationLabel()}`
        : '',
      notes: w.notes ?? [],
      window: w,
      starts: this.startsIn(w),
      expandable:
        this.organiser() || this.features().calendar || !!w.notes?.length || !!w.partial?.length,
    }));
  });

  readonly visible = computed(() =>
    this.expanded() ? this.rows() : this.rows().slice(0, COLLAPSED_ROWS),
  );

  readonly sessions = computed<Session[]>(() =>
    this.rows().map(({ window: w }) => ({ date: w.date, start: w.start, end: w.end })),
  );

  readonly pendingNames = computed(() => {
    const names = this.result().pending.map((p) => p.name);
    if (names.length <= 2) return names.join(' and ');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  });

  /** Shortlists already sent, with who said yes to what. */
  readonly asked = computed<Asked[]>(() =>
    this.shortlists().map((list) => ({
      id: list.id,
      url: `${location.origin}/s/${list.id}`,
      mode: list.mode,
      answered: list.answers.length,
      rows: list.sessions.map((s, i) => ({
        text: `${shortDate(s.date)} · ${formatMinutes(s.start)} – ${formatMinutes(s.end)}`,
        yes: list.answers
          .filter((a) => a.picks.includes(i))
          .map((a) => {
            const start = a.starts?.[i];
            const len = Math.min(list.minutes ?? this.minutes(), s.end - s.start);
            return {
              name: a.name,
              at:
                start === undefined
                  ? ''
                  : `${formatMinutes(start)} – ${formatMinutes(start + len)}`,
            };
          }),
      })),
      none: list.answers.filter((a) => a.picks.length === 0).map((a) => a.name),
    })),
  );

  fmt = formatMinutes;

  /** Start times in 30-minute steps (hourly when the window is long). */
  private startsIn(w: CommonWindow): number[] {
    const len = Math.min(this.minutes(), w.end - w.start);
    const room = w.end - w.start - len;
    const step = room > 6 * 60 ? 60 : 30;
    const out: number[] = [];
    for (let s = w.start; s + len <= w.end; s += step) out.push(s);
    return out;
  }

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Opens a session ready for booking, e.g. after its gold band was tapped in the calendar. */
  openFor(date: string, start: number): boolean {
    // The window that contains this moment; it may have grown or shrunk since it was sent.
    const index = this.rows().findIndex(
      (r) => r.window.date === date && r.window.start <= start && start < r.window.end,
    );
    if (index < 0) return false;
    const key = this.rows()[index].key;
    const row = this.rows()[index];
    this.folded.set(false);
    if (index >= COLLAPSED_ROWS) this.expanded.set(true);
    this.openRow.set(key);
    this.selecting.set(row.starts.length > 1 ? key : null);
    setTimeout(() =>
      this.host.nativeElement
        .querySelector('li.open')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
    return true;
  }

  toggleFold(): void {
    this.folded.set(!this.isFolded());
  }

  toggleRow(r: Row): void {
    if (!r.expandable) return;
    this.selecting.set(null);
    this.openRow.set(this.openRow() === r.key ? null : r.key);
  }

  startOf(r: Row): number {
    return this.pickedStart()[r.key] ?? r.window.start;
  }

  /** "10:30 – 12:30": the meetup-length window the organiser is about to book. */
  chosen(r: Row): string {
    const start = this.startOf(r);
    const len = Math.min(this.minutes(), r.window.end - r.window.start);
    return `${formatMinutes(start)} – ${formatMinutes(start + len)}`;
  }

  pickStart(r: Row, start: number): void {
    this.pickedStart.update((all) => ({ ...all, [r.key]: start }));
  }

  confirmBooking(r: Row): void {
    const start = this.startOf(r);
    const len = Math.min(this.minutes(), r.window.end - r.window.start);
    this.selecting.set(null);
    this.openRow.set(null);
    this.folded.set(null);
    this.book.emit({ date: r.window.date, start, end: start + len });
  }

  addToCalendar(r: Row): void {
    const w = r.window;
    const start = this.startOf(r);
    const end = Math.min(w.end, start + this.minutes());
    const notes = [
      this.description(),
      w.end > end ? `Everyone is free ${r.day} ${r.time}.` : '',
      this.url() ? `Planned with When: ${this.url()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    openInCalendar(
      buildIcs({
        title: this.title(),
        description: notes,
        date: w.date,
        start,
        end,
        url: this.url(),
      }),
      'when.ics',
    );
  }

  async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(url);
      setTimeout(() => this.copied.set(null), 1800);
    } catch {
      /* ignore */
    }
  }
}

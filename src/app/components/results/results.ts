import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';

import { MatIconModule } from '@angular/material/icon';

import { AvailabilityResult } from '../../core/availability';

import { EventApi } from '../../core/event-api';

import { Identity } from '../../core/identity';

import { CommonWindow, Session, Shortlist } from '../../core/models';

import { Features, NO_FEATURES } from '../../core/prefs';

import { formatDuration, shortDate } from '../../core/time';
import { dayOf, spanAt, timeAt } from '../../core/zone';

import { AskPanel } from '../ask-panel/ask-panel';
import { Fold } from '../fold';

import { t, tn, listOf } from '../../core/i18n/i18n';

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

/** Chips shown before the rest hide behind "+N more": three rows of two. */
const LIMIT = 6;

/** Compact list of possible sessions, with the Pro extras when they are switched on. */
@Component({
  selector: 'app-results',
  imports: [MatButtonModule, MatIconModule, AskPanel, Fold],
  templateUrl: './results.html',
  styleUrl: './results.scss',
})
export class Results {
  readonly t = t;
  readonly tn = tn;
  readonly result = input.required<AvailabilityResult>();
  readonly durationHours = input.required<number>();
  readonly partialOk = input(false);
  readonly features = input<Features>(NO_FEATURES);
  readonly organiser = input(false);
  readonly eventId = input('');
  readonly shortlists = input<Shortlist[]>([]);
  /** A session is already booked, so the list starts folded away. */
  readonly booked = input(false);

  /** The organiser settles on a session. */
  readonly book = output<Session>();

  readonly limit = LIMIT;

  /** Whole card folded to one line; null follows the default (folded once booked). */
  private readonly folded = signal<boolean | null>(null);
  readonly isFolded = computed(() => this.folded() ?? this.booked());
  readonly expanded = signal(false);
  /** Row whose details are open. */
  readonly openRow = signal<string | null>(null);
  /** Start the organiser picked per row; defaults to the start of the window. */
  private readonly pickedStart = signal<Record<string, number>>({});
  readonly asking = signal(false);
  /** The link just made, shown with a filled Copy button until it is copied. */
  readonly fresh = signal<string | null>(null);
  readonly copied = signal<string | null>(null);
  /** Sent link the organiser is about to remove. */
  readonly removing = signal<string | null>(null);
  private readonly api = inject(EventApi);
  private readonly identity = inject(Identity);

  readonly minutes = computed(() => Math.round(this.durationHours() * 60));
  readonly durationLabel = computed(() => formatDuration(this.minutes()));

  /** In date order; the app doesn't rank them, the organiser decides. */
  readonly rows = computed<Row[]>(() => {
    const ordered = [...this.result().windows].sort(
      (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
    );
    return ordered.map((w) => ({
      key: `${w.date}-${w.start}`,
      day: shortDate(dayOf(w.date, w.start)),
      time: spanAt(w.date, w.start, w.end),
      length: formatDuration(w.end - w.start),
      partial: w.partial?.length
        ? t('{names} can’t stay the full {length}', {
            names: w.partial.join(', '),
            length: this.durationLabel(),
          })
        : '',
      notes: w.notes ?? [],
      window: w,
      starts: this.startsIn(w),
      expandable: this.organiser() || !!w.notes?.length || !!w.partial?.length,
    }));
  });

  /** With more than fit, one place is given to the "+N more" chip. */
  readonly visible = computed(() =>
    this.expanded() || this.rows().length <= LIMIT ? this.rows() : this.rows().slice(0, LIMIT - 1),
  );
  readonly selected = computed(() => this.rows().find((r) => r.key === this.openRow()) ?? null);

  readonly sessions = computed<Session[]>(() =>
    this.rows().map(({ window: w }) => ({ date: w.date, start: w.start, end: w.end })),
  );

  readonly pendingNames = computed(() => {
    return listOf(this.result().pending.map((p) => p.name));
  });

  /** Shortlists already sent, with who said yes to what. */
  readonly asked = computed<Asked[]>(() =>
    this.shortlists().map((list) => ({
      id: list.id,
      url: `${location.origin}/s/${list.id}`,
      mode: list.mode,
      answered: list.answers.length,
      rows: list.sessions.map((s, i) => ({
        text: `${shortDate(dayOf(s.date, s.start))} · ${spanAt(s.date, s.start, s.end)}`,
        yes: list.answers
          .filter((a) => a.picks.includes(i))
          .map((a) => {
            const start = a.starts?.[i];
            const len = Math.min(list.minutes ?? this.minutes(), s.end - s.start);
            return {
              name: a.name,
              at: start === undefined ? '' : spanAt(s.date, start, start + len),
            };
          }),
      })),
      none: list.answers.filter((a) => a.picks.length === 0).map((a) => a.name),
    })),
  );

  /** A start time inside a session, in the viewer's time. */
  startLabel = (r: Row, min: number) => timeAt(r.window.date, min);

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
    this.folded.set(false);
    if (index >= LIMIT - 1) this.expanded.set(true);
    this.openRow.set(key);
    setTimeout(() =>
      this.host.nativeElement
        .querySelector('.detail')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
    return true;
  }

  toggleFold(): void {
    this.folded.set(!this.isFolded());
  }

  toggleRow(r: Row): void {
    if (!r.expandable) return;
    this.openRow.set(this.openRow() === r.key ? null : r.key);
  }

  startOf(r: Row): number {
    return this.pickedStart()[r.key] ?? r.window.start;
  }

  /** "10:30 – 12:30": the meetup-length window the organiser is about to book. */
  chosen(r: Row): string {
    const start = this.startOf(r);
    const len = Math.min(this.minutes(), r.window.end - r.window.start);
    return spanAt(r.window.date, start, start + len);
  }

  pickStart(r: Row, start: number): void {
    this.pickedStart.update((all) => ({ ...all, [r.key]: start }));
  }

  confirmBooking(r: Row): void {
    const start = this.startOf(r);
    const len = Math.min(this.minutes(), r.window.end - r.window.start);
    this.openRow.set(null);
    this.folded.set(null);
    this.book.emit({ date: r.window.date, start, end: start + len });
  }

  /** Withdraws a sent link; whoever has it sees that it no longer exists. */
  async remove(id: string): Promise<void> {
    const token = this.identity.creatorToken(this.eventId());
    this.removing.set(null);
    if (!token) return;
    try {
      await this.api.removeShortlist(this.eventId(), id, token);
    } catch {
      /* the list refreshes from the server either way */
    }
  }

  async copy(url: string): Promise<void> {
    this.fresh.set(null);
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(url);
      setTimeout(() => this.copied.set(null), 1800);
    } catch {
      /* ignore */
    }
  }
}

import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EventApi } from '../../core/event-api';
import { ShortlistView } from '../../core/models';
import { dayMonth, formatDuration, formatMinutes, weekdayLong } from '../../core/time';
import { dayOf, eventZone, spanAt, timeAt } from '../../core/zone';
import { ZoneNote } from '../../components/zone-note/zone-note';

/**
 * What someone sees when they open a shortlist link: only the listed sessions.
 * They type their name, tap what works, and send. No calendar involved.
 */
@Component({
  selector: 'app-shortlist',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule, ZoneNote],
  templateUrl: './shortlist.html',
  styleUrl: './shortlist.scss',
})
export class ShortlistPage {
  private readonly api = inject(EventApi);

  /** Route param. */
  readonly sid = input.required<string>();

  readonly list = signal<ShortlistView | null>(null);
  readonly missing = signal(false);
  readonly name = signal(loadName());
  readonly picks = signal<Set<number>>(new Set());
  /** Chosen start per session index; missing means any time in the session suits. */
  readonly starts = signal<Record<number, number>>({});
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  readonly dates = computed(() => (this.list()?.sessions ?? []).map((s) => s.date));
  readonly single = computed(() => this.list()?.mode === 'one');
  readonly canSend = computed(() => this.name().trim().length > 0 && !this.busy());
  readonly cards = computed(() =>
    (this.list()?.sessions ?? []).map((s, i) => {
      const len = Math.min(this.list()!.minutes, s.end - s.start);
      const room = s.end - s.start - len;
      const step = room > 6 * 60 ? 60 : 30;
      const options: number[] = [];
      if (room > 0) for (let t = s.start; t + len <= s.end; t += step) options.push(t);
      const start = this.starts()[i];
      return {
        day: weekdayLong(dayOf(s.date, s.start)),
        date: dayMonth(dayOf(s.date, s.start)),
        time: spanAt(s.date, s.start, s.end),
        eventDate: s.date,
        /** Start times to choose from; empty when the session is exactly as long as needed. */
        options,
        start,
        chosen: start === undefined ? '' : spanAt(s.date, start, start + len),
      };
    }),
  );
  readonly lengthLabel = computed(() => formatDuration(this.list()?.minutes ?? 0));
  fmt = (date: string, min: number) => timeAt(date, min);

  constructor() {
    effect(() => {
      const sid = this.sid();
      this.api
        .getShortlist(sid)
        .then((l) => {
          if (!l) return this.missing.set(true);
          eventZone.set(l.timeZone ?? null);
          this.list.set(l);
        })
        .catch(() => this.missing.set(true));
    });
  }

  toggle(i: number): void {
    this.sent.set(false);
    this.picks.update((set) => {
      if (this.single()) return set.has(i) ? new Set() : new Set([i]);
      const next = new Set(set);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  /** Pick a start inside a session; undefined means any time suits. */
  setStart(i: number, start: number | undefined): void {
    this.sent.set(false);
    this.starts.update((all) => {
      const next = { ...all };
      if (start === undefined) delete next[i];
      else next[i] = start;
      return next;
    });
  }

  async send(e?: Event): Promise<void> {
    e?.preventDefault();
    if (!this.canSend()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const name = this.name().trim();
      await this.api.answerShortlist(this.sid(), name, [...this.picks()], this.starts());
      saveName(name);
      this.sent.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      this.busy.set(false);
    }
  }
}

function loadName(): string {
  try {
    return localStorage.getItem('when:name') ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem('when:name', name);
  } catch {
    /* ignore */
  }
}

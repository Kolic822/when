import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventApi } from '../../core/event-api';
import { Identity } from '../../core/identity';
import { Session } from '../../core/models';
import { formatMinutes, shortDate } from '../../core/time';
import { dayOf, spanAt, timeAt } from '../../core/zone';
import { t } from '../../core/i18n/i18n';

/**
 * "Ask someone": the organiser picks which possible sessions to send and whether the
 * answer is one choice or several, and gets a link that shows only those sessions.
 */
@Component({
  selector: 'app-ask-panel',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './ask-panel.html',
  styleUrl: './ask-panel.scss',
})
export class AskPanel {
  readonly t = t;
  private readonly api = inject(EventApi);
  private readonly identity = inject(Identity);

  readonly eventId = input.required<string>();
  readonly sessions = input.required<Session[]>();
  readonly closed = output<void>();

  /** Indices of the sessions to include; all by default. */
  readonly chosen = signal<Set<number> | null>(null);
  readonly mode = signal<'one' | 'many'>('one');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly link = signal<string | null>(null);
  readonly copied = signal(false);

  readonly picked = computed(() => this.chosen() ?? new Set(this.sessions().map((_, i) => i)));

  label(s: Session): string {
    return `${shortDate(dayOf(s.date, s.start))} · ${spanAt(s.date, s.start, s.end)}`;
  }

  toggle(i: number): void {
    const next = new Set(this.picked());
    next.has(i) ? next.delete(i) : next.add(i);
    this.chosen.set(next);
  }

  async create(): Promise<void> {
    const token = this.identity.creatorToken(this.eventId());
    const sessions = this.sessions().filter((_, i) => this.picked().has(i));
    if (!token || !sessions.length || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const list = await this.api.createShortlist(this.eventId(), token, this.mode(), sessions);
      this.link.set(`${location.origin}/s/${list.id}`);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      this.busy.set(false);
    }
  }

  async copy(): Promise<void> {
    const url = this.link();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      /* ignore */
    }
  }
}

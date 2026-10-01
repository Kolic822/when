import { Component, computed, inject, input, output, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';

import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { EventApi } from '../../core/event-api';

import { Identity } from '../../core/identity';

import { Session } from '../../core/models';

import { shortDate } from '../../core/time';

import { dayOf, spanAt } from '../../core/zone';

import { t } from '../../core/i18n/i18n';

/**
 * "Ask someone": the organiser picks which possible sessions to send and whether the
 * answer is one choice or several, and gets a link that shows only those sessions.
 */
@Component({
  selector: 'app-ask-panel',
  imports: [MatButtonModule, MatIconModule, MatSlideToggleModule],
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
  /** A link was made and its address copied: its id, so the list below can say so. */
  readonly created = output<string>();

  /** Indices of the sessions to include; all by default. */
  readonly chosen = signal<Set<number> | null>(null);
  readonly mode = signal<'one' | 'many'>('one');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

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
    // The link's address is chosen here, so it can go to the clipboard right at the tap:
    // phones refuse clipboard writes once a request has been awaited.
    const listId = newListId();
    void navigator.clipboard?.writeText(`${location.origin}/s/${listId}`).catch(() => undefined);
    try {
      const list = await this.api.createShortlist(
        this.eventId(),
        token,
        this.mode(),
        sessions,
        listId,
      );
      this.created.emit(list.id);
      this.closed.emit();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      this.busy.set(false);
    }
  }
}

/** 8 letters and digits, like the server's own ids. */
function newListId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

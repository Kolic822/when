import { Component, computed, input, output, signal } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';

import { Session, Shortlist } from '../../core/models';

import { shortDate } from '../../core/time';

import { dayOf, spanAt } from '../../core/zone';

import { t, listOf } from '../../core/i18n/i18n';

export interface Verdict {
  /** Who answered, e.g. "Mia and Zed". */
  names: string;
  /** Shortlist id plus the time of its newest answer: a new answer brings the card back. */
  stamp: string;
  headline: string;
  detail: string;
  /** The session most people said yes to; null when nobody can make any of them. */
  session: Session | null;
  /** Exact window to book when the answers agree on one, otherwise the organiser picks. */
  window: Session | null;
}

/**
 * Tells the organiser what came back from an "Ask someone" link and offers the next
 * step. It stays until a session is booked or the organiser puts it away.
 */
@Component({
  selector: 'app-answer-card',
  imports: [MatIconModule],
  template: `
    @if (minimised(); as m) {
      <button type="button" class="mini" (click)="restore(m.stamp)">
        <mat-icon>mark_email_read</mat-icon>
        <span>{{ t('Answer from {names}', { names: m.names }) }}</span>
        <span class="show">{{ t('Show') }}</span>
      </button>
    }
    @if (verdict(); as v) {
      <section class="card answer" role="status">
        <span class="badge"><mat-icon>mark_email_read</mat-icon>{{ t('Answer') }}</span>
        <p class="headline">{{ v.headline }}</p>
        @if (v.detail) {
          <p class="muted detail">{{ v.detail }}</p>
        }
        <div class="acts">
          <button type="button" class="pill later" (click)="dismiss(v.stamp)">
            {{ t('Not now') }}
          </button>
          @if (v.window; as w) {
            <button type="button" class="pill book-full" (click)="book.emit(w)">
              {{ t('Book') }}
              <span class="d">{{ day(w) }}</span>
              <span class="t">{{ span(w) }}</span>
              <mat-icon>check</mat-icon>
            </button>
          } @else if (v.session; as s) {
            <button type="button" class="pill go" (click)="choose.emit(s)">
              <mat-icon>schedule</mat-icon>
              {{ t('Pick a time') }}
            </button>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .answer {
      padding: 12px 14px;
      border: 1.5px solid var(--accent);
      animation: settle 0.3s cubic-bezier(0.2, 1.2, 0.4, 1) both;
    }
    .mini {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 44px;
      padding: 0 14px;
      border: 1.5px solid var(--accent);
      border-radius: 999px;
      background: var(--when-surface);
      color: var(--when-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      text-align: left;
      cursor: pointer;

      mat-icon {
        color: var(--accent);
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .show {
        margin-left: auto;
        color: var(--accent);
        font-weight: 600;
      }
      &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--accent);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }
    .headline {
      margin: 4px 0 0;
      font-family: var(--font-display);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.25;
    }
    .detail {
      margin: 2px 0 0;
      font-size: 13px;
    }
    .acts {
      display: flex;
      gap: 8px;
      margin-top: 10px;

      .pill {
        height: 38px;
        font-size: 14px;
      }
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    .later {
      flex: none;
      padding: 0 14px;
      font-size: 13px;
      color: var(--when-muted);
    }
    .go {
      flex: 1;
      justify-content: center;
      background: var(--accent);
      color: #fff;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class AnswerCard {
  readonly t = t;
  readonly shortlists = input<Shortlist[]>([]);
  /** Meetup length in minutes, for links made before the length was stored on them. */
  readonly minutes = input.required<number>();

  readonly book = output<Session>();
  /** The organiser still has to choose a start inside this session. */
  readonly choose = output<Session>();

  private readonly dismissed = signal<Set<string>>(loadDismissed());

  day = (s: Session) => shortDate(dayOf(s.date, s.start));
  span = (s: Session) => spanAt(s.date, s.start, s.end);

  private readonly latest = computed(() => latestVerdict(this.shortlists(), this.minutes()));
  readonly verdict = computed(() => {
    const v = this.latest();
    return v && !this.dismissed().has(v.stamp) ? v : null;
  });
  /** Put away with "Not now": stays as one line that brings the card back. */
  readonly minimised = computed(() => {
    const v = this.latest();
    return v && this.dismissed().has(v.stamp) ? v : null;
  });

  restore(stamp: string): void {
    this.dismissed.update((set) => {
      const next = new Set(set);
      next.delete(stamp);
      saveDismissed(next);
      return next;
    });
  }

  dismiss(stamp: string): void {
    this.dismissed.update((set) => {
      const next = new Set(set).add(stamp);
      saveDismissed(next);
      return next;
    });
  }
}

export function latestVerdict(shortlists: Shortlist[], minutes: number): Verdict | null {
  // The link that was answered most recently.
  const list = [...shortlists]
    .filter((l) => l.answers.length)
    .sort((a, b) => newest(b).localeCompare(newest(a)))[0];
  if (!list) return null;
  const stamp = `${list.id}:${newest(list)}`;

  const count = list.answers.length;
  const counted = count === 1 ? '' : t('{n} answers so far.', { n: count });
  const yes = list.sessions.map((_, i) => list.answers.filter((a) => a.picks.includes(i)));
  const top = yes.reduce((best, who, i) => (who.length > yes[best].length ? i : best), 0);
  if (!yes[top].length) {
    const names = join(list.answers.map((a) => a.name));
    return {
      stamp,
      names,
      headline: t('{names} can’t make any of the sessions you sent', { names }),
      detail: '',
      session: null,
      window: null,
    };
  }

  const session = list.sessions[top];
  const len = Math.min(list.minutes ?? minutes, session.end - session.start);
  const names = join(yes[top].map((a) => a.name));
  const verb = yes[top].length === 1 && list.mode === 'one' ? 'picked' : 'can do';
  const starts = new Set(
    yes[top].map((a) => a.starts?.[top]).filter((s): s is number => s !== undefined),
  );
  const fixed = session.end - session.start <= len;
  const start = fixed ? session.start : starts.size === 1 ? [...starts][0] : null;
  const day = shortDate(dayOf(session.date, session.start));

  if (start !== null) {
    return {
      stamp,
      names,
      headline:
        verb === 'picked'
          ? t('{names} picked a session', { names })
          : t('{names} can do this one', { names }),
      detail: counted,
      session,
      window: { date: session.date, start, end: start + len },
    };
  }
  return {
    stamp,
    names,
    headline: t(verb === 'picked' ? '{names} picked {session}' : '{names} can do {session}', {
      names,
      session: `${day} · ${spanAt(session.date, session.start, session.end)}`,
    }),
    detail: [
      starts.size > 1 ? t('They prefer different start times.') : t('Any start time suits.'),
      counted,
    ]
      .filter(Boolean)
      .join(' '),
    session,
    window: null,
  };
}

function newest(list: Shortlist): string {
  return list.answers.reduce((max, a) => (a.at > max ? a.at : max), '');
}

function join(names: string[]): string {
  return listOf(names);
}

const KEY = 'when:answers-seen';

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set].slice(-50)));
  } catch {
    /* ignore */
  }
}

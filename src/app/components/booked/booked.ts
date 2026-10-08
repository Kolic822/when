import { Component, computed, inject, input, output } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';

import { openInCalendar } from '../../core/calendar';

import { Session } from '../../core/models';

import { weekdayLong, weekdayShort, dayMonth } from '../../core/time';

import { dayOf, spanAt } from '../../core/zone';

import { listOf, t } from '../../core/i18n/i18n';
import { canShare, shareOrCopy } from '../../core/share';
import { MatSnackBar } from '@angular/material/snack-bar';

/** The session the organiser settled on, shown to everyone at the top of the When. */
@Component({
  selector: 'app-booked',
  imports: [MatIconModule],
  template: `
    <section class="booked">
      <span class="badge"><mat-icon>check_circle</mat-icon>{{ t('Booked') }}</span>
      @for (row of rows(); track row.key) {
        <div class="row" [class.single]="rows().length === 1">
          <p class="when">
            <strong>{{ row.day }}</strong>
            <span>{{ row.time }}</span>
          </p>
          <div class="actions">
            <button
              type="button"
              class="pill"
              (click)="addToCalendar(row.session)"
              [attr.aria-label]="
                t('Add {session} to calendar', { session: row.day + ' ' + row.time })
              "
            >
              <mat-icon>event</mat-icon>
              @if (rows().length === 1) {
                {{ t('Add to calendar') }}
              }
            </button>
            @if (organiser()) {
              <button
                type="button"
                class="pill ghost"
                (click)="unbooked.emit(row.session)"
                [attr.aria-label]="t('Cancel {session}', { session: row.day + ' ' + row.time })"
              >
                @if (rows().length === 1) {
                  {{ t('Undo') }}
                } @else {
                  <mat-icon>close</mat-icon>
                }
              </button>
            }
          </div>
        </div>
      }
      @if (organiser()) {
        <button type="button" class="pill tell" (click)="tell()">
          <mat-icon>{{ canShare ? 'ios_share' : 'content_copy' }}</mat-icon>
          {{ t('Tell the group') }}
        </button>
      }
    </section>
  `,
  styles: `
    .tell {
      align-self: flex-start;
      margin-top: 4px;
      background: rgba(255, 255, 255, 0.18);
      color: inherit;
    }
    .booked {
      padding: 14px 16px;
      border-radius: var(--when-radius);
      background: var(--accent);
      color: var(--on-accent);
      animation: settle 0.3s cubic-bezier(0.2, 1.2, 0.4, 1) both;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      opacity: 0.9;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }
    /* Several sessions: one compact line each. */
    .row:not(.single) {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 0;
      border-top: 1px solid color-mix(in srgb, var(--on-accent) 22%, transparent);

      .when {
        margin: 0;
        font-size: 16px;
      }
      .pill {
        width: 38px;
        padding: 0;
      }
    }
    .row:not(.single):first-of-type {
      margin-top: 6px;
    }
    .when {
      margin: 4px 0 10px;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 10px;
      font-family: var(--font-display);
      font-size: 22px;
      line-height: 1.2;

      strong {
        font-weight: 700;
      }
      span {
        font-weight: 500;
        font-variant-numeric: tabular-nums;
      }
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .pill {
      background: var(--on-accent);
      color: var(--accent);

      &:hover {
        background: var(--on-accent);
        color: var(--accent);
      }
      &.ghost {
        background: color-mix(in srgb, var(--on-accent) 18%, transparent);
        color: var(--on-accent);
      }
    }
  `,
})
export class Booked {
  readonly t = t;
  readonly sessions = input.required<Session[]>();
  readonly eventId = input('');
  readonly title = input('When');
  readonly url = input('');
  readonly canShare = canShare;
  private readonly snack = inject(MatSnackBar);

  /** The organiser sends the booked time to the group, with the link for the calendar. */
  async tell(): Promise<void> {
    const when = listOf(this.rows().map((r) => `${r.day} ${r.time}`));
    const done = await shareOrCopy({
      title: this.title(),
      text: t('{title}: we meet {when}. Add it to your calendar here:', {
        title: this.title(),
        when,
      }),
      url: this.url(),
    });
    if (done === 'copied') {
      this.snack.open(t('Message copied – send it to your group'), undefined, { duration: 2500 });
    }
  }
  readonly organiser = input(false);
  /** The organiser takes one session back. */
  readonly unbooked = output<Session>();

  readonly rows = computed(() =>
    this.sessions().map((session) => ({
      key: `${session.date}-${session.start}`,
      session,
      day: label(dayOf(session.date, session.start), this.sessions().length === 1),
      time: spanAt(session.date, session.start, session.end),
    })),
  );

  addToCalendar(s: Session): void {
    openInCalendar(this.eventId(), s);
  }
}

function label(date: string, long: boolean): string {
  return `${long ? weekdayLong(date) : weekdayShort(date)} ${dayMonth(date)}`;
}

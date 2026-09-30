import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { buildIcs, openInCalendar } from '../../core/calendar';
import { Session } from '../../core/models';
import { formatMinutes, weekdayLong, weekdayShort, dayMonth } from '../../core/time';
import { dayOf, spanAt, timeAt } from '../../core/zone';

/** The session the organiser settled on, shown to everyone at the top of the When. */
@Component({
  selector: 'app-booked',
  imports: [MatIconModule],
  template: `
    <section class="booked">
      <span class="badge"><mat-icon>check_circle</mat-icon>Booked</span>
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
              [attr.aria-label]="'Add ' + row.day + ' ' + row.time + ' to calendar'"
            >
              <mat-icon>event</mat-icon>
              @if (rows().length === 1) {
                Add to calendar
              }
            </button>
            @if (organiser()) {
              <button
                type="button"
                class="pill ghost"
                (click)="unbooked.emit(row.session)"
                [attr.aria-label]="'Cancel ' + row.day + ' ' + row.time"
              >
                @if (rows().length === 1) {
                  Undo
                } @else {
                  <mat-icon>close</mat-icon>
                }
              </button>
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: `
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
  readonly sessions = input.required<Session[]>();
  readonly title = input('Meetup');
  readonly description = input('');
  readonly url = input('');
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
    const notes = [this.description(), this.url() ? `Planned with When: ${this.url()}` : '']
      .filter(Boolean)
      .join('\n\n');
    openInCalendar(
      buildIcs({
        title: this.title(),
        description: notes,
        date: s.date,
        start: s.start,
        end: s.end,
        url: this.url(),
      }),
      'when.ics',
    );
  }
}

function label(date: string, long: boolean): string {
  return `${long ? weekdayLong(date) : weekdayShort(date)} ${dayMonth(date)}`;
}

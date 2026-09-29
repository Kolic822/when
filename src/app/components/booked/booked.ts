import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { buildIcs, openInCalendar } from '../../core/calendar';
import { Session } from '../../core/models';
import { formatMinutes, weekdayLong, dayMonth } from '../../core/time';

/** The session the organiser settled on, shown to everyone at the top of the When. */
@Component({
  selector: 'app-booked',
  imports: [MatIconModule],
  template: `
    <section class="booked">
      <span class="badge"><mat-icon>check_circle</mat-icon>Booked</span>
      <p class="when">
        <strong>{{ day() }}</strong>
        <span>{{ time() }}</span>
      </p>
      <div class="actions">
        <button type="button" class="pill" (click)="addToCalendar()">
          <mat-icon>event</mat-icon>
          Add to calendar
        </button>
        @if (organiser()) {
          <button type="button" class="pill ghost" (click)="unbooked.emit()">Undo</button>
        }
      </div>
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
  readonly session = input.required<Session>();
  readonly title = input('Meetup');
  readonly description = input('');
  readonly url = input('');
  readonly organiser = input(false);
  readonly unbooked = output<void>();

  readonly day = computed(
    () => `${weekdayLong(this.session().date)} ${dayMonth(this.session().date)}`,
  );
  readonly time = computed(
    () => `${formatMinutes(this.session().start)} – ${formatMinutes(this.session().end)}`,
  );

  addToCalendar(): void {
    const s = this.session();
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

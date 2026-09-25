import { Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AvailabilityResult, bestWindow } from '../../core/availability';
import { formatDuration, formatMinutes, shortDate } from '../../core/time';

interface Row {
  key: string;
  best: boolean;
  day: string;
  time: string;
  length: string;
  /** People who can't stay for the whole meetup (partial-attendance mode). */
  partial: string;
  notes: { name: string; note: string }[];
}

const COLLAPSED_ROWS = 3;

/** Compact list of possible sessions; collapses to three rows with a show-more toggle. */
@Component({
  selector: 'app-results',
  imports: [MatIconModule],
  template: `
    <section class="card results">
      <header>
        <mat-icon>event_available</mat-icon>
        <h2>Possible sessions</h2>
        <span class="length" title="Meetup length">
          <mat-icon>schedule</mat-icon>
          {{ durationLabel() }}
        </span>
      </header>

      @if (rows().length) {
        <ul>
          @for (r of visible(); track r.key) {
            <li>
              <span class="line">
                @if (r.best) {
                  <span class="best"><mat-icon>star</mat-icon>Best</span>
                }
                <span class="day">{{ r.day }}</span>
                <span class="time">{{ r.time }}</span>
                <span class="len muted">{{ r.length }}</span>
              </span>
              @if (r.partial || r.notes.length) {
                <span class="extra muted">
                  @if (r.partial) {
                    {{ r.partial }}
                  }
                  @for (n of r.notes; track $index) {
                    <span class="note">{{ n.name }}: {{ n.note }}</span>
                  }
                </span>
              }
            </li>
          }
        </ul>
        @if (rows().length > collapsedRows) {
          <button
            type="button"
            class="more"
            (click)="expanded.set(!expanded())"
            [attr.aria-expanded]="expanded()"
          >
            {{ expanded() ? 'Show less' : 'Show ' + (rows().length - collapsedRows) + ' more' }}
            <mat-icon>{{ expanded() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </button>
        }
      } @else if (result().answered.length === 0) {
        <p class="muted">Nothing yet. Tap a day below to mark when you're free.</p>
      } @else if (result().answered.length === 1) {
        <p class="muted">
          Waiting for one more person. Only {{ result().answered[0].name }} has answered so far.
        </p>
      } @else {
        <p class="muted">
          No {{ durationLabel() }} window fits everyone{{ partialOk() ? ', even partly' : '' }} yet.
          Try adding more times.
        </p>
      }

      @if (result().pending.length && result().answered.length) {
        <p class="pending muted">Waiting for {{ pendingNames() }}.</p>
      }
    </section>
  `,
  styles: `
    .results {
      padding: 10px 14px 12px;
    }
    header {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 6px 8px;
      margin-bottom: 6px;

      mat-icon {
        align-self: center;
        color: var(--when-common);
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      h2 {
        margin: 0;
        font-size: 16px;
        letter-spacing: -0.01em;
      }
      .length {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-left: auto;
        align-self: center;
        font-size: 13px;
        font-weight: 600;
        color: var(--when-text);

        mat-icon {
          color: var(--when-muted);
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: flex;
      flex-direction: column;
      padding: 5px 0;
      border-top: 1px solid var(--when-border);
      font-size: 14px;
    }
    .line {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .day {
      font-weight: 600;
      min-width: 92px;
    }
    .best {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 1px 8px 1px 5px;
      border-radius: 999px;
      background: var(--when-common-bg);
      color: var(--when-text);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--when-common);
      }
    }
    .time {
      font-variant-numeric: tabular-nums;
    }
    .len {
      margin-left: auto;
      font-size: 13px;
    }
    .extra {
      font-size: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 2px 10px;
    }
    .more {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      margin-top: 4px;
      padding: 4px 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      color: var(--mat-sys-primary);
      cursor: pointer;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      &:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        border-radius: 4px;
      }
    }
    p {
      margin: 0;
      font-size: 14px;
    }
    .pending {
      margin-top: 6px;
      font-size: 12px;
    }
  `,
})
export class Results {
  readonly result = input.required<AvailabilityResult>();
  readonly durationHours = input.required<number>();
  readonly partialOk = input(false);

  readonly collapsedRows = COLLAPSED_ROWS;
  readonly expanded = signal(false);

  readonly durationLabel = computed(() => formatDuration(this.durationHours() * 60));

  /** Best = fewest people leaving early, then the longest overlap, then the earliest. */
  readonly rows = computed<Row[]>(() => {
    const windows = [...this.result().windows];
    if (!windows.length) return [];
    const best = bestWindow(windows)!;
    const ordered = [best, ...windows.filter((w) => w !== best)];
    return ordered.map((w) => ({
      key: `${w.date}-${w.start}`,
      best: w === best && windows.length > 1,
      day: shortDate(w.date),
      time: `${formatMinutes(w.start)} – ${formatMinutes(w.end)}`,
      length: formatDuration(w.end - w.start),
      partial: w.partial?.length
        ? `${w.partial.join(', ')} can't stay the full ${this.durationLabel()}`
        : '',
      notes: w.notes ?? [],
    }));
  });

  readonly visible = computed(() =>
    this.expanded() ? this.rows() : this.rows().slice(0, COLLAPSED_ROWS),
  );

  readonly pendingNames = computed(() => {
    const names = this.result().pending.map((p) => p.name);
    if (names.length <= 2) return names.join(' and ');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  });
}

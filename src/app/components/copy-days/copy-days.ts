import { Component, computed, effect, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { shortDate } from '../../core/time';

/** "Same times on other days": pick which of the other days should get a copy. */
@Component({
  selector: 'app-copy-days',
  host: { '[class.open]': 'open()', '[class.compact]': 'compact()' },
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule],
  template: `
    @if (!open()) {
      <button
        type="button"
        class="pill"
        [class.big]="big()"
        (click)="show()"
        [disabled]="disabled()"
      >
        <mat-icon>content_copy</mat-icon>
        Copy to…
      </button>
    } @else {
      <div class="picker">
        <div class="head">
          <strong>Copy {{ what() || fromLabel() }} to</strong>
          <button type="button" class="linkish" (click)="toggleAll()">
            {{ allChosen() ? 'Select none' : 'Select all' }}
          </button>
        </div>
        <ul>
          @for (d of others(); track d) {
            <li>
              <mat-checkbox [checked]="chosen().has(d)" (change)="toggle(d, $event.checked)">
                {{ compact() ? shortLabel(d) : label(d) }}
              </mat-checkbox>
            </li>
          }
        </ul>
        <div class="actions">
          <button type="button" class="pill" (click)="cancel()">Cancel</button>
          <button mat-flat-button type="button" (click)="apply()" [disabled]="!chosen().size">
            @if (compact()) {
              Copy ({{ chosen().size }})
            } @else {
              Copy to {{ chosen().size }} {{ chosen().size === 1 ? 'day' : 'days' }}
            }
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .big {
      width: 100%;
      height: 48px;
      font-size: 15px;
    }
    .picker {
      border: 1px solid var(--when-border);
      border-radius: 10px;
      padding: 10px 12px;
      background: var(--when-bg);
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 4px;
      font-size: 14px;
    }
    .linkish {
      border: 0;
      background: none;
      padding: 0;
      font: inherit;
      font-size: 13px;
      color: var(--mat-sys-primary);
      cursor: pointer;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 6px;
    }
    :host(.compact) {
      .picker {
        padding: 8px 6px;
      }
      .head {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        font-size: 12px;
      }
      ul {
        grid-template-columns: 1fr;
      }
      li {
        font-size: 12px;
        margin-left: -6px;
        white-space: nowrap;
        --mat-checkbox-state-layer-size: 28px;
      }
      .actions {
        flex-direction: column-reverse;
        gap: 4px;

        button {
          width: 100%;
          height: 34px;
          padding: 0 6px;
          font-size: 12px;
        }
      }
    }
  `,
})
export class CopyDays {
  readonly dates = input.required<string[]>();
  readonly from = input.required<string>();
  readonly disabled = input(false);
  /** Full-width, taller trigger (used in the day stepper). */
  readonly big = input(false);
  readonly applied = output<string[]>();
  readonly cancelled = output<void>();
  /** What is being copied, e.g. "10:15 – 13:45"; defaults to the day. */
  readonly what = input('');
  /** Open the picker immediately (no trigger button). */
  readonly startOpen = input(false);
  /** Narrow vertical layout for a side column. */
  readonly compact = input(false);

  constructor() {
    effect(() => {
      if (this.startOpen()) this.show();
    });
  }

  readonly open = signal(false);
  readonly chosen = signal<Set<string>>(new Set());
  readonly others = computed(() => this.dates().filter((d) => d !== this.from()));
  readonly allChosen = computed(() => this.others().every((d) => this.chosen().has(d)));
  readonly fromLabel = computed(() => shortDate(this.from()));

  label = shortDate;

  /** "Thu 24" for narrow columns. */
  shortLabel(date: string): string {
    return shortDate(date).split(' ').slice(0, 2).join(' ');
  }

  show(): void {
    this.chosen.set(new Set());
    this.open.set(true);
  }

  toggle(date: string, on: boolean): void {
    this.chosen.update((set) => {
      const next = new Set(set);
      on ? next.add(date) : next.delete(date);
      return next;
    });
  }

  toggleAll(): void {
    this.chosen.set(this.allChosen() ? new Set() : new Set(this.others()));
  }

  apply(): void {
    this.applied.emit([...this.chosen()]);
    this.open.set(false);
  }

  cancel(): void {
    this.open.set(false);
    this.cancelled.emit();
  }
}

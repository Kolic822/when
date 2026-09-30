import {
  booleanAttribute,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { HistoryEntry } from '../../core/models';
import { formatMinutes, shortDate } from '../../core/time';

interface Row {
  id: string;
  color: string;
  name: string;
  text: string;
  when: string;
}

/** Collapsible log of what everyone did, newest first. */
@Component({
  selector: 'app-history',
  imports: [MatIconModule],
  template: `
    <section class="history" [class.card]="!bare()">
      @if (!bare()) {
        <button
          type="button"
          class="toggle"
          (click)="open.set(!open())"
          [attr.aria-expanded]="open()"
        >
          <mat-icon>history</mat-icon>
          <span class="title">History</span>
          <span class="count muted">{{ rows().length }}</span>
          <mat-icon class="chev">{{ open() ? 'expand_less' : 'expand_more' }}</mat-icon>
        </button>
      }
      @if (open() || bare()) {
        @if (rows().length) {
          <ol>
            @for (r of rows(); track r.id) {
              <li>
                <span class="dot" [style.background]="r.color"></span>
                <span
                  ><strong>{{ r.name }}</strong> {{ r.text }}</span
                >
                <span class="when muted">{{ r.when }}</span>
              </li>
            }
          </ol>
        } @else {
          <p class="muted empty">Nothing yet.</p>
        }
      }
    </section>
  `,
  styles: `
    .history.card {
      padding: 4px 8px;
    }
    .history:not(.card) ol {
      padding: 0;
      max-height: 260px;
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      cursor: pointer;
      border-radius: 12px;
      text-align: left;

      .title {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 15px;
      }
      .count {
        font-size: 13px;
      }
      .chev {
        margin-left: auto;
        color: var(--when-muted);
      }
      &:focus-visible {
        outline: 2px solid var(--accent);
      }
    }
    ol {
      list-style: none;
      margin: 0;
      padding: 0 8px 8px;
      max-height: 300px;
      overflow-y: auto;
    }
    li {
      display: grid;
      grid-template-columns: 10px 1fr auto;
      gap: 10px;
      align-items: baseline;
      padding: 6px 0;
      border-top: 1px solid var(--when-border);
      font-size: 13px;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      align-self: center;
    }
    .when {
      font-size: 12px;
      white-space: nowrap;
    }
    .empty {
      margin: 0;
      padding: 0 8px 10px;
      font-size: 13px;
    }
  `,
})
export class History {
  readonly entries = input.required<HistoryEntry[]>();
  readonly meId = input<string | null>(null);
  /** Just the list, for use inside another panel such as the menu. */
  readonly bare = input(false, { transform: booleanAttribute });

  readonly open = signal(false);
  private readonly now = signal(Date.now());

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  readonly rows = computed<Row[]>(() => {
    const now = this.now();
    return [...this.entries()].reverse().map((e) => ({
      id: e.id,
      color: e.color ?? '#9ca3af',
      name: e.participantId && e.participantId === this.meId() ? 'You' : e.name,
      text: describe(e),
      when: relative(e.at, now),
    }));
  });
}

function describe(e: HistoryEntry): string {
  const day = e.date ? shortDate(e.date) : '';
  const span =
    e.start !== undefined && e.end !== undefined
      ? `${formatMinutes(e.start)} – ${formatMinutes(e.end)}`
      : '';
  switch (e.kind) {
    case 'joined':
      return 'joined';
    case 'left':
      return 'left';
    case 'renamed':
      return e.text ? `changed name from ${e.text}` : 'changed name';
    case 'added':
      return `added ${day}, ${span}`;
    case 'removed':
      return `removed ${day}, ${span}`;
    case 'changed':
      return `moved ${day} to ${span}`;
    case 'cleared':
      return `cleared ${day}`;
    case 'settings':
      return 'updated the When';
  }
}

function relative(iso: string, now: number): string {
  const min = Math.round(Math.max(0, now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

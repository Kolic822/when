import { Component, computed, input, model, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Participant } from '../../core/models';
import { t } from '../../core/i18n/i18n';

/** People chips with colour, online badge and answer status. */
@Component({
  selector: 'app-legend',
  imports: [MatIconModule],
  template: `
    <ul class="legend" [attr.aria-label]="t('People')">
      @for (p of ordered(); track p.id) {
        <li>
          <button
            type="button"
            class="chip"
            [class.pending]="!p.slots.length"
            [class.selected]="selected() === p.id"
            [style.--c]="p.color"
            [attr.aria-pressed]="selected() === p.id"
            [title]="
              t(selected() === p.id ? 'Stop highlighting {name}' : 'Highlight {name}', {
                name: p.name,
              }) + (online().has(p.id) ? ' · ' + t('online') : '')
            "
            (click)="toggle(p.id)"
            (pointerenter)="onHover($event, p.id)"
            (pointerleave)="onHover($event, null)"
            (blur)="hovered.emit(null)"
          >
            <span
              class="dot"
              [style.background]="p.color"
              [class.online]="online().has(p.id)"
            ></span>
            <span class="name">{{ p.name }}</span>
            @if (p.id === meId()) {
              <span class="you">{{ t('you') }}</span>
            } @else if (!p.slots.length) {
              <span class="status">{{ t('no times yet') }}</span>
            }
          </button>
          @if (p.id === meId()) {
            <button
              type="button"
              class="icon-btn edit"
              (click)="renameRequested.emit()"
              [attr.aria-label]="t('Change your name')"
              [title]="t('Change your name')"
            >
              <mat-icon>edit</mat-icon>
            </button>
          } @else if (organiser() && selected() === p.id) {
            <button
              type="button"
              class="icon-btn edit"
              (click)="asking.set(p)"
              [attr.aria-label]="t('Remove {name}', { name: p.name })"
              [title]="t('Remove {name}', { name: p.name })"
            >
              <mat-icon>person_remove</mat-icon>
            </button>
          }
        </li>
      }
      @if (asking(); as p) {
        <li class="ask">
          <span>{{ t('Remove {name} and their times?', { name: p.name }) }}</span>
          <button type="button" class="pill mini" (click)="asking.set(null)">
            {{ t('Keep') }}
          </button>
          <button type="button" class="pill mini danger" (click)="confirmRemove(p)">
            {{ t('Remove') }}
          </button>
        </li>
      }
      @if (!participants().length) {
        <li class="muted">{{ t('Nobody here yet.') }}</li>
      }
      @if (answeredCount() < participants().length) {
        <li class="count muted">
          {{ t('{n} of {total} answered', { n: answeredCount(), total: participants().length }) }}
        </li>
      }
    </ul>
  `,
  styles: `
    .legend {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
    }
    li {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px 3px 6px;
      border-radius: 999px;
      background: var(--when-surface);
      border: 1px solid transparent;
      box-shadow: var(--card-shadow);
      font: inherit;
      font-size: 12px;
      color: inherit;
      cursor: pointer;
      transition:
        border-color 0.12s,
        box-shadow 0.12s;

      &:hover,
      &.selected {
        border-color: var(--c);
      }
      &.selected {
        box-shadow: inset 0 0 0 1px var(--c);
      }
      &:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }
      &.pending .name {
        color: var(--when-muted);
      }
    }
    .edit {
      width: 26px;
      height: 26px;
      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
    }
    .dot {
      position: relative;
      width: 10px;
      height: 10px;
      border-radius: 999px;
      flex: none;

      &.online::after {
        content: '';
        position: absolute;
        right: -3px;
        bottom: -3px;
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #22c55e;
        border: 2px solid var(--when-surface);
        box-sizing: content-box;
      }
    }
    .you,
    .status {
      font-size: 10px;
      color: var(--when-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .status {
      text-transform: none;
      font-style: italic;
    }
    .count {
      font-size: 12px;
      padding-left: 2px;
    }
    .ask {
      flex-basis: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
      padding: 8px 10px;
      border-radius: 12px;
      background: var(--when-surface);
      box-shadow: var(--card-shadow);
      font-size: 13px;

      span {
        flex: 1;
      }
    }
    .mini {
      height: 30px;
      padding: 0 12px;
      font-size: 12px;
    }
    .mini.danger {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
  `,
})
export class Legend {
  readonly t = t;
  readonly participants = input.required<Participant[]>();
  readonly meId = input<string | null>(null);
  readonly online = input<ReadonlySet<string>>(new Set());
  readonly renameRequested = output<void>();
  /** The organiser may take people out, e.g. a double left behind by a lost browser storage. */
  readonly organiser = input(false);
  readonly removeRequested = output<Participant>();
  readonly asking = signal<Participant | null>(null);

  confirmRemove(p: Participant): void {
    this.asking.set(null);
    this.selected.set(null);
    this.removeRequested.emit(p);
  }
  /** Sticky highlight (click); two-way. */
  readonly selected = model<string | null>(null);
  /** Transient highlight while hovering or focusing a chip. */
  readonly hovered = output<string | null>();

  /** Same order as the chart lanes: everyone else, then you. */
  readonly ordered = computed(() => {
    const me = this.meId();
    const all = this.participants();
    return [...all.filter((p) => p.id !== me), ...all.filter((p) => p.id === me)];
  });

  toggle(id: string): void {
    this.selected.set(this.selected() === id ? null : id);
    // A tap has no "leave", so never let a transient highlight outlive the click.
    this.hovered.emit(null);
  }

  /** Hover only counts for a real mouse; touch taps go through toggle(). */
  onHover(e: PointerEvent, id: string | null): void {
    if (e.pointerType === 'mouse') this.hovered.emit(id);
  }

  readonly answeredCount = computed(
    () => this.participants().filter((p) => p.slots.length > 0).length,
  );
}

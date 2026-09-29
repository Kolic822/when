import { Component, computed, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Push } from '../../core/push';

/** One small control: get told when the session is booked (and, for the organiser, when someone answers). */
@Component({
  selector: 'app-notify',
  imports: [MatIconModule],
  template: `
    @switch (state()) {
      @case ('off') {
        <button type="button" class="pill bell" [disabled]="push.busy()" (click)="turnOn()">
          <mat-icon>notifications_none</mat-icon>
          {{ organiser() ? 'Notify me about answers' : 'Notify me when it’s booked' }}
        </button>
      }
      @case ('on') {
        <button
          type="button"
          class="pill bell on"
          [disabled]="push.busy()"
          (click)="push.disable(eventId())"
          aria-pressed="true"
        >
          <mat-icon>notifications_active</mat-icon>
          Notifications on
        </button>
      }
      @case ('install') {
        <p class="note muted">
          <mat-icon>ios_share</mat-icon>
          To get notified on iPhone, tap Share, then “Add to Home Screen”, and open When from there.
        </p>
      }
      @case ('blocked') {
        <p class="note muted">
          <mat-icon>notifications_off</mat-icon>
          Notifications are blocked for When in your browser settings.
        </p>
      }
    }
    @if (failed()) {
      <p class="note error" role="alert">Couldn’t turn on notifications. Try again.</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    :host:empty {
      display: none;
    }
    .bell {
      height: 36px;
      padding: 0 14px;
      font-size: 13px;
      color: var(--accent);
      background: var(--when-surface);
      box-shadow: var(--card-shadow);

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      &.on {
        color: var(--when-muted);
      }
    }
    .note {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin: 0;
      font-size: 12px;
      line-height: 1.35;

      mat-icon {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }
    .error {
      margin-top: 6px;
      color: var(--mat-sys-error);
    }
  `,
})
export class Notify {
  readonly push = inject(Push);

  readonly eventId = input.required<string>();
  readonly organiser = input(false);

  readonly state = computed(() => this.push.state(this.eventId()));
  readonly failed = signal(false);

  async turnOn(): Promise<void> {
    this.failed.set(false);
    const ok = await this.push.enable(this.eventId());
    // Saying no in the browser's own prompt is a choice, not a failure.
    if (!ok && this.state() !== 'blocked') this.failed.set(true);
  }
}

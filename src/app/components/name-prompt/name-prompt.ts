import { Component, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { t, m } from '../../core/i18n/i18n';

@Component({
  selector: 'app-name-prompt',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <form class="card prompt" (submit)="submit($event)">
      <h2>{{ t(heading()) }}</h2>
      @if (hint()) {
        <p class="muted">{{ t(hint()!) }}</p>
      }
      <mat-form-field appearance="outline">
        <mat-label>{{ t('Your name') }}</mat-label>
        <input
          matInput
          [value]="name()"
          (input)="name.set($any($event.target).value)"
          autocomplete="given-name"
          autofocus
          maxlength="40"
        />
        @if (error()) {
          <mat-hint class="error">{{ error() }}</mat-hint>
        }
      </mat-form-field>
      @if (reclaimable()) {
        <button type="button" class="pill thats-me" (click)="reclaimed.emit(name().trim())">
          <mat-icon>person_check</mat-icon>
          {{ t('That’s me, carry on as {name}', { name: name().trim() }) }}
        </button>
      }
      <div class="actions">
        @if (cancellable()) {
          <button type="button" class="pill" (click)="cancelled.emit()">{{ t('Cancel') }}</button>
        }
        <button mat-flat-button type="submit" [disabled]="!name().trim()">
          {{ t(submitLabel()) }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .prompt {
      max-width: 420px;
      display: flex;
      flex-direction: column;
    }
    h2 {
      margin: 0 0 4px;
      font-size: 22px;
      letter-spacing: -0.02em;
    }
    p {
      margin: 0 0 16px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .error {
      color: var(--mat-sys-error);
    }
    .thats-me {
      align-self: flex-start;
      margin: 4px 0 8px;
      background: var(--accent-soft);
      color: var(--accent);
    }
  `,
})
export class NamePrompt {
  readonly t = t;
  readonly heading = input(m('Who are you?'));
  readonly hint = input<string | null>(m('Your name is shown to the others in the group.'));
  readonly initialName = input('');
  readonly submitLabel = input(m('Let’s go'));
  readonly cancellable = input(false);
  readonly error = input<string | null>(null);
  /** The typed name belongs to someone who is away: offer to carry on as them. */
  readonly reclaimable = input(false);
  readonly reclaimed = output<string>();
  readonly submitted = output<string>();
  readonly cancelled = output<void>();

  readonly name = signal('');

  constructor() {
    // Seed once from the input without keeping them linked.
    queueMicrotask(() => this.name.set(this.initialName()));
  }

  submit(e: Event): void {
    e.preventDefault();
    const n = this.name().trim();
    if (n) this.submitted.emit(n);
  }
}

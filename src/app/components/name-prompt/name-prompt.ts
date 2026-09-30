import { Component, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { t, m } from '../../core/i18n/i18n';

@Component({
  selector: 'app-name-prompt',
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule],
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

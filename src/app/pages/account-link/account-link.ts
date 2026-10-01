import { Component, inject, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Auth } from '../../core/auth';
import { t } from '../../core/i18n/i18n';

/**
 * Where the links in account emails lead: confirming an email address, or choosing a
 * new password. The one-time token sits after the # of the address and is taken out of
 * the address bar as soon as it has been read.
 */
@Component({
  selector: 'app-account-link',
  imports: [FormField, RouterLink, MatIconModule, MatProgressSpinnerModule],
  template: `
    <main class="page link-page">
      <h1 class="brand">When <span class="tagline">are you free?</span></h1>

      <section class="card box">
        @switch (state()) {
          @case ('working') {
            <mat-spinner diameter="28" [attr.aria-label]="t('One moment…')" />
          }
          @case ('form') {
            <h2>{{ t('Set a new password') }}</h2>
            <form (submit)="save($event)">
              <label>
                <span class="muted">{{ t('New password') }}</span>
                <input type="password" [formField]="form.password" autocomplete="new-password" />
                <span class="muted hint">{{ t('At least 8 characters.') }}</span>
              </label>
              @if (error()) {
                <p class="error" role="alert">{{ error() }}</p>
              }
              <button type="submit" class="pill go" [disabled]="busy()">
                {{ t('Save and sign in') }}
              </button>
            </form>
          }
          @case ('confirmed') {
            <mat-icon class="big ok" aria-hidden="true">check_circle</mat-icon>
            <h2>{{ t('Email confirmed') }}</h2>
            <p class="muted">{{ t('Thanks, {email} is confirmed.', { email: email() }) }}</p>
            <a routerLink="/" class="pill go">{{ t('Open When') }}</a>
          }
          @case ('bad') {
            <mat-icon class="big" aria-hidden="true">link_off</mat-icon>
            <h2>{{ t('This link no longer works') }}</h2>
            <p class="muted">
              {{ t('Links work once and for a limited time. Ask for a new one.') }}
            </p>
            <a routerLink="/" class="pill go">{{ t('Open When') }}</a>
          }
        }
      </section>
    </main>
  `,
  styles: `
    .link-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      min-height: 100dvh;
      max-width: 420px;
      text-align: center;
    }
    .brand {
      margin: 0;
      font-size: clamp(28px, 7vw, 34px);
    }
    .box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 22px 18px;
    }
    h2 {
      margin: 0;
      font-size: 20px;
    }
    p {
      margin: 0;
      font-size: 14px;
    }
    .big {
      width: 40px;
      height: 40px;
      font-size: 40px;
      color: var(--when-muted);

      &.ok {
        color: var(--accent);
      }
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
      text-align: left;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 12px;
    }
    input {
      height: 44px;
      padding: 0 12px;
      border: 1.5px solid var(--when-border);
      border-radius: 12px;
      background: var(--when-surface);
      color: var(--when-text);
      font: inherit;
      /* 16px keeps iOS from zooming in on focus. */
      font-size: 16px;

      &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
      }
    }
    .hint {
      font-size: 11px;
    }
    .go {
      justify-content: center;
      width: 100%;
      height: 46px;
      margin-top: 6px;
      background: var(--accent);
      color: #fff;
      text-decoration: none;
    }
  `,
})
export class AccountLink {
  readonly t = t;
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  /** Which email link this is; set by the route. */
  private readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as 'verify' | 'reset';

  readonly state = signal<'working' | 'form' | 'confirmed' | 'bad'>('working');
  readonly email = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly fields = signal({ password: '' });
  readonly form = form(this.fields);

  private readonly token = takeToken();

  constructor() {
    void this.start();
  }

  private async start(): Promise<void> {
    if (!this.token) return this.state.set('bad');
    if (this.kind === 'reset') return this.state.set('form');
    const done = await this.auth.confirmEmail(this.token);
    this.email.set(done.email ?? '');
    this.state.set(done.email ? 'confirmed' : 'bad');
  }

  async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const code = await this.auth.resetPassword(this.token, this.fields().password);
    this.busy.set(false);
    if (!code) return void this.router.navigateByUrl('/');
    if (code === 'bad_link') return this.state.set('bad');
    this.error.set(
      code === 'bad_password'
        ? t('The password needs at least 8 characters.')
        : code === 'too_many_tries'
          ? t('Too many tries. Wait a few minutes and try again.')
          : code === 'offline'
            ? t('No connection. Try again.')
            : t('Something went wrong'),
    );
  }
}

/** Reads the token after the # and removes it from the address bar and history. */
function takeToken(): string {
  const token = location.hash.slice(1);
  if (token) history.replaceState(history.state, '', location.pathname);
  return /^[\w-]{20,100}$/.test(token) ? token : '';
}

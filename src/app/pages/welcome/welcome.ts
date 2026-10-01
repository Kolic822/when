import {
  afterNextRender,
  Component,
  effect,
  untracked,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Auth } from '../../core/auth';
import { LANGS, lang, m, setLang, t } from '../../core/i18n/i18n';

/** First screen on a new device: come in with Google, or carry on as a guest. */
@Component({
  selector: 'app-welcome',
  imports: [FormField, RouterLink, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss',
})
export class Welcome {
  readonly t = t;
  readonly auth = inject(Auth);
  private readonly router = inject(Router);

  /** Where the person was heading, e.g. a When someone sent them. */
  readonly next = input('/', {
    // The router hands over `undefined` when the address has no ?next=…
    transform: (value: string | undefined) => value || '/',
  });

  /** They came by a link to a When, most likely from a chat. */
  readonly invited = computed(() => this.next().startsWith('/e/'));

  private readonly googleHost = viewChild<ElementRef<HTMLElement>>('google');
  readonly failed = signal(false);

  readonly langs = LANGS;
  readonly lang = lang;
  readonly setLang = setLang;

  constructor() {
    afterNextRender(() => this.drawGoogle());
    // Google's button carries its own words, so it is drawn again in the chosen language.
    effect(() => {
      lang();
      untracked(() => this.drawGoogle());
    });
  }

  private drawGoogle(): void {
    const host = this.googleHost()?.nativeElement;
    if (!host) return;
    void this.auth
      .renderGoogleButton(host, (ok) => (ok ? this.enter() : this.failed.set(true)))
      .catch(() => this.failed.set(true));
  }

  // ---- Email and password
  readonly emailMode = signal<'login' | 'register' | 'forgot' | null>(null);
  /** The "check your inbox" note after asking for a new password. */
  readonly linkSent = signal(false);
  readonly emailBusy = signal(false);
  readonly emailError = signal('');
  private readonly fields = signal({ email: '', username: '', password: '' });
  readonly form = form(this.fields);

  setEmailMode(mode: 'login' | 'register' | 'forgot'): void {
    this.emailError.set('');
    this.linkSent.set(false);
    this.emailMode.set(mode);
  }

  async submitEmail(event: Event): Promise<void> {
    event.preventDefault();
    const mode = this.emailMode();
    if (!mode || this.emailBusy()) return;
    this.emailBusy.set(true);
    this.emailError.set('');
    const typed = this.fields();
    if (mode === 'forgot') {
      const failed = await this.auth.forgot(typed.email.trim());
      this.emailBusy.set(false);
      if (failed) this.emailError.set(emailError(failed));
      else this.linkSent.set(true);
      return;
    }
    const code = await this.auth.withEmail(mode, {
      email: typed.email.trim(),
      username: typed.username.trim(),
      password: typed.password,
    });
    this.emailBusy.set(false);
    if (!code) return this.enter();
    this.emailError.set(emailError(code));
  }

  guest(): void {
    this.auth.continueAsGuest();
    this.enter();
  }

  private enter(): void {
    // Only ever a path inside the app, and never back to this screen.
    const next = this.next();
    const inside = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/welcome');
    void this.router.navigateByUrl(inside ? next : '/');
  }
}

const emailError = (code: string) =>
  EMAIL_ERRORS[code] ? t(EMAIL_ERRORS[code]) : t('Something went wrong');

/** What the server may answer, as sentences. */
const EMAIL_ERRORS: Record<string, string> = {
  bad_email: m('That doesn’t look like an email address.'),
  bad_username: m('Pick a username of at least 2 characters.'),
  bad_password: m('The password needs at least 8 characters.'),
  email_taken: m('There is already an account with that email. Sign in instead.'),
  username_taken: m('That username is taken. Try another.'),
  wrong_login: m('Wrong email or password.'),
  too_many_tries: m('Too many tries. Wait a few minutes and try again.'),
  offline: m('No connection. Try again.'),
};

import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Auth } from '../../core/auth';

/** First screen on a new device: come in with Google, or carry on as a guest. */
@Component({
  selector: 'app-welcome',
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss',
})
export class Welcome {
  readonly auth = inject(Auth);
  private readonly router = inject(Router);

  /** Where the person was heading, e.g. a When someone sent them. */
  readonly next = input('/');

  private readonly googleHost = viewChild<ElementRef<HTMLElement>>('google');
  readonly failed = signal(false);

  constructor() {
    afterNextRender(() => {
      const host = this.googleHost()?.nativeElement;
      if (!host) return;
      void this.auth
        .renderGoogleButton(host, (ok) => (ok ? this.enter() : this.failed.set(true)))
        .catch(() => this.failed.set(true));
    });
  }

  guest(): void {
    this.auth.continueAsGuest();
    this.enter();
  }

  private enter(): void {
    // Only ever a path inside the app.
    const next = this.next();
    void this.router.navigateByUrl(next.startsWith('/') && !next.startsWith('//') ? next : '/');
  }
}

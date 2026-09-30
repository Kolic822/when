import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PrefsStore } from './core/prefs';
import { Updates } from './core/updates';
import { HowToState } from './core/how-to-state';
import { HowTo } from './components/how-to/how-to';
import { lang } from './core/i18n/i18n';
import { Sync } from './core/sync';

@Component({
  imports: [RouterOutlet, HowTo],
  selector: 'app-root',
  template: `
    <router-outlet />
    @if (howTo.open()) {
      <app-how-to />
    }
  `,
})
export class App {
  /** Started with the app so a signed-in device fetches its Whens straight away. */
  private readonly sync = inject(Sync);
  constructor() {
    document.documentElement.lang = lang();
  }

  // Instantiated here so the saved theme is applied before any page renders.
  private readonly prefs = inject(PrefsStore);
  // Starts update checks for the installed PWA.
  private readonly updates = inject(Updates);
  protected readonly howTo = inject(HowToState);
}

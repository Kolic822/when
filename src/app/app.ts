import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PrefsStore } from './core/prefs';
import { Updates } from './core/updates';
import { HowToState } from './core/how-to-state';
import { HowTo } from './components/how-to/how-to';

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
  // Instantiated here so the saved theme is applied before any page renders.
  private readonly prefs = inject(PrefsStore);
  // Starts update checks for the installed PWA.
  private readonly updates = inject(Updates);
  protected readonly howTo = inject(HowToState);
}

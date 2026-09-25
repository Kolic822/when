import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PrefsStore } from './core/prefs';
import { Updates } from './core/updates';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet />',
})
export class App {
  // Instantiated here so the saved theme is applied before any page renders.
  private readonly prefs = inject(PrefsStore);
  // Starts update checks for the installed PWA.
  private readonly updates = inject(Updates);
}

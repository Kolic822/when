import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Identity, RecentMeetup } from '../../core/identity';
import { PrefsStore, Theme } from '../../core/prefs';
import { Updates } from '../../core/updates';
import { HOUR_OPTIONS, formatMinutes, rangeLabel, shortDate, toDateKey } from '../../core/time';
import { EventApi } from '../../core/event-api';
import { bestWindow, findCommonWindows } from '../../core/availability';
import { DURATIONS } from '../../pages/home/durations';

/** The ☰ menu: your Whens, appearance and defaults for new Whens. */
@Component({
  selector: 'app-menu',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './app-menu.html',
  styleUrl: './app-menu.scss',
})
export class AppMenu {
  private readonly identity = inject(Identity);
  private readonly router = inject(Router);
  readonly store = inject(PrefsStore);
  readonly updates = inject(Updates);

  private readonly api = inject(EventApi);

  readonly open = signal(false);
  readonly recent = signal<RecentMeetup[]>([]);
  /** Per When: best session text, '' while loading, or null when none. */
  readonly best = signal<Record<string, string | null>>({});
  readonly prefs = this.store.prefs;

  readonly themes: { value: Theme; label: string; icon: string }[] = [
    { value: 'system', label: 'System', icon: 'brightness_auto' },
    { value: 'light', label: 'Light', icon: 'light_mode' },
    { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  ];
  readonly durations = DURATIONS;
  readonly startOptions = HOUR_OPTIONS.slice(0, 24);
  readonly endOptions = HOUR_OPTIONS.slice(1);
  readonly rangeValid = computed(
    () => this.prefs().dayEnd - this.prefs().dayStart >= this.prefs().durationHours * 60,
  );

  private readonly today = toDateKey(new Date());

  toggle(): void {
    if (!this.open()) {
      this.recent.set(this.identity.recent());
      this.loadBest();
    }
    this.open.set(!this.open());
  }

  /** Looks up each remembered When and works out its best possible session. */
  private async loadBest(): Promise<void> {
    const list = this.recent();
    this.best.set(Object.fromEntries(list.map((m) => [m.id, ''])));
    await Promise.all(
      list.map(async (m) => {
        try {
          const ev = await this.api.get(m.id);
          const w = ev ? bestWindow(findCommonWindows(ev).windows) : null;
          const text = w
            ? `${shortDate(w.date)} · ${formatMinutes(w.start)} – ${formatMinutes(w.end)}`
            : null;
          this.best.update((b) => ({ ...b, [m.id]: text }));
          if (ev && (ev.title !== m.title || ev.dates.join() !== m.dates.join())) {
            this.identity.remember({ ...m, title: ev.title, dates: ev.dates });
            this.recent.set(this.identity.recent());
          }
        } catch {
          this.best.update((b) => ({ ...b, [m.id]: null }));
        }
      }),
    );
  }

  close(): void {
    this.open.set(false);
  }

  rangeOf(m: RecentMeetup): string {
    return rangeLabel(m.dates);
  }

  isPast(m: RecentMeetup): boolean {
    const last = m.dates[m.dates.length - 1];
    return !!last && last < this.today;
  }

  /** Card whose delete/leave confirmation is showing. */
  readonly confirmId = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);

  askRemove(m: RecentMeetup, e: Event): void {
    e.stopPropagation();
    this.confirmId.set(this.confirmId() === m.id ? null : m.id);
  }

  isOrganiser(m: RecentMeetup): boolean {
    return !!this.identity.creatorToken(m.id);
  }

  /** Organiser: deletes the When for everyone. Member: leaves it (their answers are removed). */
  async confirmRemove(m: RecentMeetup): Promise<void> {
    this.busyId.set(m.id);
    try {
      const token = this.identity.creatorToken(m.id);
      const me = this.identity.get(m.id);
      if (token) await this.api.remove(m.id, token);
      else if (me) await this.api.leave(m.id, me.id);
    } catch {
      /* best effort – it is forgotten locally either way */
    }
    this.identity.forget(m.id);
    this.identity.clear(m.id);
    this.recent.set(this.identity.recent());
    this.busyId.set(null);
    this.confirmId.set(null);
    if (this.router.url.includes(`/e/${m.id}`)) {
      this.close();
      this.router.navigate(['/']);
    }
  }

  goHome(): void {
    this.close();
    this.router.navigate(['/']);
  }

  setTheme(theme: Theme): void {
    this.store.update({ theme });
  }

  readonly updateText = computed(() => {
    switch (this.updates.status()) {
      case 'unsupported':
        return 'Updates apply automatically when opened in a browser.';
      case 'checking':
        return 'Checking…';
      case 'uptodate':
        return 'You have the latest version.';
      case 'ready':
        return 'A new version is ready.';
      case 'error':
        return 'Could not check right now.';
      default:
        return '';
    }
  });
}

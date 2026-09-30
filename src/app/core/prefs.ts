import { computed, effect, inject, Service, signal } from '@angular/core';
import { Auth } from './auth';
import { DEFAULT_DAY_END, DEFAULT_DAY_START } from './models';
import { DateStyle, dateStyle } from './time';

export type Theme = 'system' | 'light' | 'dark';
export type Look = 'grape' | 'sunset' | 'lagoon';

/**
 * Pro features. They are on for everyone signed in with Google and off for guests;
 * nothing to switch. `multiBook` is the one exception: a Pro setting the person chooses.
 */
export interface Features {
  /** Own calendar events behind the bars. */
  connect: boolean;
  /** The organiser may book more than one session. */
  multiBook: boolean;
  /** Add any possible session to the calendar, not only the booked one. */
  calendar: boolean;
  /** Outsource the decision: a link with only the possible sessions. */
  shortlist: boolean;
  /** People may join for part of a meetup. */
  partial: boolean;
  history: boolean;
}

export const NO_FEATURES: Features = {
  connect: false,
  multiBook: false,
  calendar: false,
  shortlist: false,
  partial: false,
  history: false,
};

/** What is kept on the device. */
interface Stored {
  theme: Theme;
  look: Look;
  dateStyle: DateStyle;
  durationHours: number;
  dayStart: number;
  dayEnd: number;
  /** Pro setting: booking another day adds a session instead of replacing the first. */
  multiBook: boolean;
  /** Pro setting: show what calendar events are called, not just "Busy". */
  calendarNames: boolean;
  /** Pro setting: show events that last the whole day. */
  calendarAllDay: boolean;
}

export interface Prefs extends Stored {
  features: Features;
}

const KEY = 'when:prefs';
const DEFAULTS: Stored = {
  theme: 'system',
  look: 'grape',
  dateStyle: 'numeric',
  durationHours: 3,
  dayStart: DEFAULT_DAY_START,
  dayEnd: DEFAULT_DAY_END,
  multiBook: false,
  calendarNames: true,
  calendarAllDay: true,
};

/** Per-browser preferences: appearance, defaults for new Whens and Pro settings. */
@Service()
export class PrefsStore {
  private readonly auth = inject(Auth);
  private readonly stored = signal<Stored>(load());
  private readonly initDateStyle = dateStyle.set(this.stored().dateStyle);

  /** Pro is part of signing in with Google; guests use the free app. */
  readonly pro = computed(() => this.auth.user()?.kind === 'google');

  readonly prefs = computed<Prefs>(() => {
    const stored = this.stored();
    return {
      ...stored,
      features: this.pro()
        ? {
            connect: true,
            calendar: true,
            shortlist: true,
            partial: true,
            history: true,
            multiBook: stored.multiBook,
          }
        : NO_FEATURES,
    };
  });

  constructor() {
    effect(() => {
      const p = this.stored();
      try {
        localStorage.setItem(KEY, JSON.stringify(p));
      } catch {
        /* ignore */
      }
      applyTheme(p.theme, p.look);
      dateStyle.set(p.dateStyle);
    });
  }

  update(patch: Partial<Stored>): void {
    this.stored.update((p) => ({ ...p, ...patch }));
  }
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Stored> & { features?: Partial<Features> };
    const { features, ...rest } = saved;
    // The "book several" choice used to live among the feature switches.
    return { ...DEFAULTS, multiBook: features?.multiBook ?? DEFAULTS.multiBook, ...rest };
  } catch {
    return DEFAULTS;
  }
}

/** `data-theme` drives our CSS variables; `color-scheme` drives Angular Material's light-dark() colours. */
function applyTheme(theme: Theme, look: Look): void {
  const root = document.documentElement;
  if (look === 'grape') root.removeAttribute('data-look');
  else root.setAttribute('data-look', look);
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme === 'system' ? 'light dark' : theme;
}

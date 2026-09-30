import { effect, Service, signal } from '@angular/core';
import { DEFAULT_DAY_END, DEFAULT_DAY_START } from './models';
import { DateStyle, dateStyle } from './time';

export type Theme = 'system' | 'light' | 'dark';
export type Look = 'grape' | 'sunset' | 'lagoon';

/** Pro features, switchable in the menu while they are in preview. */
export interface Features {
  /** Preview of the calendar overlay, drawn with sample events. */
  connect: boolean;
  /** The organiser may book more than one session. */
  multiBook: boolean;
  calendar: boolean;
  shortlist: boolean;
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

export interface Prefs {
  theme: Theme;
  look: Look;
  dateStyle: DateStyle;
  features: Features;
  durationHours: number;
  dayStart: number;
  dayEnd: number;
  partialOk: boolean;
}

const KEY = 'when:prefs';
const DEFAULTS: Prefs = {
  theme: 'system',
  look: 'grape',
  dateStyle: 'numeric',
  features: NO_FEATURES,
  durationHours: 3,
  dayStart: DEFAULT_DAY_START,
  dayEnd: DEFAULT_DAY_END,
  partialOk: false,
};

/** Per-browser preferences: appearance and defaults for new Whens. */
@Service()
export class PrefsStore {
  readonly prefs = signal<Prefs>(load());
  private readonly initDateStyle = dateStyle.set(this.prefs().dateStyle);

  constructor() {
    effect(() => {
      const p = this.prefs();
      try {
        localStorage.setItem(KEY, JSON.stringify(p));
      } catch {
        /* ignore */
      }
      applyTheme(p.theme, p.look);
      dateStyle.set(p.dateStyle);
    });
  }

  setFeature(key: keyof Features, on: boolean): void {
    this.prefs.update((p) => ({ ...p, features: { ...p.features, [key]: on } }));
  }

  update(patch: Partial<Prefs>): void {
    this.prefs.update((p) => ({ ...p, ...patch }));
  }
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULTS, ...saved, features: { ...NO_FEATURES, ...(saved.features ?? {}) } };
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

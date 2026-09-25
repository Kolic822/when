import { effect, Service, signal } from '@angular/core';
import { DEFAULT_DAY_END, DEFAULT_DAY_START } from './models';

export type Theme = 'system' | 'light' | 'dark';

export interface Prefs {
  theme: Theme;
  durationHours: number;
  dayStart: number;
  dayEnd: number;
  partialOk: boolean;
}

const KEY = 'when:prefs';
const DEFAULTS: Prefs = {
  theme: 'system',
  durationHours: 3,
  dayStart: DEFAULT_DAY_START,
  dayEnd: DEFAULT_DAY_END,
  partialOk: false,
};

/** Per-browser preferences: appearance and defaults for new Whens. */
@Service()
export class PrefsStore {
  readonly prefs = signal<Prefs>(load());

  constructor() {
    effect(() => {
      const p = this.prefs();
      try {
        localStorage.setItem(KEY, JSON.stringify(p));
      } catch {
        /* ignore */
      }
      applyTheme(p.theme);
    });
  }

  update(patch: Partial<Prefs>): void {
    this.prefs.update((p) => ({ ...p, ...patch }));
  }
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** `data-theme` drives our CSS variables; `color-scheme` drives Angular Material's light-dark() colours. */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme === 'system' ? 'light dark' : theme;
}

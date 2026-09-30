import { signal } from '@angular/core';
import { de } from './de';
import { hr } from './hr';

/**
 * Translations. The English text is the key: `t('Copy link')` returns the German or
 * Croatian text when that language is chosen, and the English text otherwise, so a
 * missing translation never breaks a screen. `{name}` placeholders are filled from
 * the second argument.
 */
export type Lang = 'en' | 'de' | 'hr';

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'hr', label: 'Hrvatski' },
];

/** One text, or the forms a language needs for counts ("1 dan", "2 dana", "5 dana"). */
export type Entry = string | { one: string; few?: string; other: string };
export type Dictionary = Record<string, Entry>;

const DICTIONARIES: Record<Exclude<Lang, 'en'>, Dictionary> = { de, hr };
const LOCALES: Record<Lang, string> = { en: 'en-GB', de: 'de-DE', hr: 'hr-HR' };
const KEY = 'when:lang';

export const lang = signal<Lang>(initial());

export function setLang(value: Lang): void {
  lang.set(value);
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = value;
}

/** BCP 47 locale of the chosen language, for Intl formatting. */
export function locale(): string {
  return LOCALES[lang()];
}

/** Translates a text. `{placeholders}` are replaced from `params`. */
export function t(text: string, params?: Record<string, string | number>): string {
  const current = lang();
  const entry = current === 'en' ? undefined : DICTIONARIES[current][text];
  const found = typeof entry === 'string' ? entry : (entry?.other ?? text);
  return fill(found, params);
}

/**
 * Translates a counted text: `tn(3, '{n} day', '{n} days')`. English uses the two forms
 * given; other languages look the singular up and choose the form their grammar needs.
 */
export function tn(
  count: number,
  one: string,
  other: string,
  params?: Record<string, string | number>,
): string {
  const current = lang();
  const all = { n: count, ...params };
  if (current === 'en') return fill(count === 1 ? one : other, all);
  const entry = DICTIONARIES[current][one];
  if (!entry) return fill(count === 1 ? one : other, all);
  if (typeof entry === 'string') return fill(entry, all);
  const rule = new Intl.PluralRules(LOCALES[current]).select(count);
  const form =
    rule === 'one' ? entry.one : rule === 'few' ? (entry.few ?? entry.other) : entry.other;
  return fill(form, all);
}

/** "Ana, Ivo and Mia" in the chosen language. */
export function listOf(names: string[]): string {
  return new Intl.ListFormat(locale(), { style: 'long', type: 'conjunction' }).format(names);
}

/** Marks a text for translation where it is only defined, not shown (lists, constants). */
export function m(text: string): string {
  return text;
}

function fill(text: string, params?: Record<string, string | number>): string {
  return params ? text.replace(/\{(\w+)\}/g, (whole, name) => String(params[name] ?? whole)) : text;
}

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'de' || saved === 'hr') return saved;
  } catch {
    /* ignore */
  }
  const device = (navigator.language ?? 'en').slice(0, 2).toLowerCase();
  // Bosnian, Serbian and Montenegrin speakers read Croatian far more easily than English.
  if (['hr', 'bs', 'sr', 'me'].includes(device)) return 'hr';
  return device === 'de' ? 'de' : 'en';
}

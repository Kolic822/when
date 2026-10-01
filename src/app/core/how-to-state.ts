import { Service, signal } from '@angular/core';

const KEY = 'when:howto-seen';
const ORGANISER_KEY = 'when:howto-organiser-seen';

/**
 * Controls the "How it works" overlay. It is offered once per device, at the moment it
 * helps: right after someone joins a When (from a link, or their own), and on demand
 * from the menu. Organisers get extra pages about what only they can do, once. It can
 * always be skipped.
 */
@Service()
export class HowToState {
  readonly open = signal(false);
  /** Which pages to show this time. */
  readonly pages = signal<{ general: boolean; organiser: boolean }>({
    general: true,
    organiser: false,
  });

  /** Opens the guide unless this device has already seen or skipped the relevant pages. */
  offer(organiser = false): void {
    const general = !seen(KEY);
    const extra = organiser && !seen(ORGANISER_KEY);
    if (!general && !extra) return;
    this.pages.set({ general, organiser: extra });
    this.open.set(true);
  }

  /** From the menu: everything that applies. */
  show(organiser = false): void {
    this.pages.set({ general: true, organiser });
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
    const { general, organiser } = this.pages();
    if (general) mark(KEY);
    if (organiser) mark(ORGANISER_KEY);
  }

  /** They know the app already, e.g. from another device of theirs. */
  markSeen(): void {
    mark(KEY);
  }
}

function seen(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return true;
  }
}

function mark(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

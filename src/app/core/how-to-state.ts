import { Service, signal } from '@angular/core';

const KEY = 'when:howto-seen';

/**
 * Controls the "How it works" overlay. It is offered once per device, at the moment it
 * helps: right after someone joins a When (from a link, or their own), and on demand
 * from the menu. It can always be skipped.
 */
@Service()
export class HowToState {
  readonly open = signal(false);

  /** Opens the guide unless this device has already seen or skipped it. */
  offer(): void {
    if (!seen()) this.open.set(true);
  }

  show(): void {
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
  }
}

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

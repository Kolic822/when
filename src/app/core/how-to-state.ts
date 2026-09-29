import { Service, signal } from '@angular/core';

const KEY = 'when:howto-seen';

/** Controls the "How it works" overlay: shown once on first visit, and on demand from the menu. */
@Service()
export class HowToState {
  readonly open = signal(!seen());

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

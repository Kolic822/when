import { inject, Service, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { Identity } from './identity';

/**
 * - `on` / `off`: notifications for this When on this device
 * - `blocked`: the person said no in the browser; only they can change that in its settings
 * - `install`: an iPhone or iPad where the app must be on the Home Screen first
 * - `unsupported`: this browser cannot do it
 */
export type PushState = 'on' | 'off' | 'blocked' | 'install' | 'unsupported';

/** Notifications that arrive while the app is closed, per When and per device. */
@Service()
export class Push {
  private readonly sw = inject(SwPush);
  private readonly identity = inject(Identity);

  readonly busy = signal(false);
  /** Bumped after every change so `state()` is re-read. */
  private readonly changed = signal(0);

  state(eventId: string): PushState {
    this.changed();
    if (needsInstall()) return 'install';
    if (!this.sw.isEnabled || !('PushManager' in window) || !('Notification' in window)) {
      return 'unsupported';
    }
    if (Notification.permission === 'denied') return 'blocked';
    return Notification.permission === 'granted' && remembered(eventId) ? 'on' : 'off';
  }

  /** Asks the browser for permission (must follow a tap) and registers this device. */
  async enable(eventId: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      const res = await fetch('/api/push/key');
      if (!res.ok) throw new Error('no key');
      const { publicKey } = (await res.json()) as { publicKey: string };
      const subscription = await this.sw.requestSubscription({ serverPublicKey: publicKey });
      const saved = await fetch(`/api/events/${encodeURIComponent(eventId)}/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          participantId: this.identity.get(eventId)?.id ?? null,
          creatorToken: this.identity.creatorToken(eventId),
        }),
      });
      if (!saved.ok) throw new Error(`not saved (${saved.status})`);
      remember(eventId, true);
      return true;
    } catch {
      return false;
    } finally {
      this.busy.set(false);
      this.changed.update((n) => n + 1);
    }
  }

  /** Stops notifications for this When; other Whens on this device keep theirs. */
  async disable(eventId: string): Promise<void> {
    this.busy.set(true);
    try {
      const subscription = await firstValueFrom(this.sw.subscription);
      if (subscription) {
        await fetch(`/api/events/${encodeURIComponent(eventId)}/push`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
    } catch {
      /* forgotten locally either way */
    } finally {
      remember(eventId, false);
      this.busy.set(false);
      this.changed.update((n) => n + 1);
    }
  }
}

/** iOS only delivers notifications to web apps that were added to the Home Screen. */
function needsInstall(): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !installed;
}

function key(eventId: string): string {
  return `when:push:${eventId}`;
}

function remembered(eventId: string): boolean {
  try {
    return localStorage.getItem(key(eventId)) === '1';
  } catch {
    return false;
  }
}

function remember(eventId: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key(eventId), '1');
    else localStorage.removeItem(key(eventId));
  } catch {
    /* ignore */
  }
}

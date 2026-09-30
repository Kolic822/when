import { effect, inject, Service, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { Identity } from './identity';
import { viewerZone } from './zone';

/**
 * - `on` / `off`: notifications for this device, switched in the menu
 * - `blocked`: the person said no in the browser; only they can change that in its settings
 * - `install`: an iPhone or iPad where the app must be on the Home Screen first
 * - `unsupported`: this browser cannot do it
 */
export type PushState = 'on' | 'off' | 'blocked' | 'install' | 'unsupported';

const KEY = 'when:push';

/**
 * Notifications that arrive while the app is closed. One switch for the device;
 * every When this person is part of is registered with the server behind it.
 */
@Service()
export class Push {
  private readonly sw = inject(SwPush);
  private readonly identity = inject(Identity);

  readonly busy = signal(false);
  readonly wanted = signal(loadWanted());
  /** Bumped when the browser permission may have changed, so `state()` is re-read. */
  private readonly changed = signal(0);

  private subscription: PushSubscription | null = null;

  constructor() {
    // Switched on earlier: pick the subscription up again so new Whens can be registered.
    effect(() => {
      if (this.wanted() && this.supported()) {
        void firstValueFrom(this.sw.subscription).then((s) => (this.subscription = s));
      }
    });
  }

  state(): PushState {
    this.changed();
    if (needsInstall()) return 'install';
    if (!this.supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    return Notification.permission === 'granted' && this.wanted() ? 'on' : 'off';
  }

  /** Asks the browser (must follow a tap) and registers every When this device is part of. */
  async enable(): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      const res = await fetch('/api/push/key');
      if (!res.ok) throw new Error('no key');
      const { publicKey } = (await res.json()) as { publicKey: string };
      this.subscription = await this.sw.requestSubscription({ serverPublicKey: publicKey });
      saveWanted(true);
      this.wanted.set(true);
      await Promise.all(this.identity.recent().map((m) => this.register(m.id)));
      return true;
    } catch {
      return false;
    } finally {
      this.busy.set(false);
      this.changed.update((n) => n + 1);
    }
  }

  async disable(): Promise<void> {
    this.busy.set(true);
    try {
      const endpoint = this.subscription?.endpoint;
      if (endpoint) {
        await Promise.all(
          this.identity.recent().map((m) =>
            fetch(`/api/events/${encodeURIComponent(m.id)}/push`, {
              method: 'DELETE',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ endpoint }),
            }).catch(() => undefined),
          ),
        );
      }
    } finally {
      saveWanted(false);
      this.wanted.set(false);
      this.busy.set(false);
      this.changed.update((n) => n + 1);
    }
  }

  /** Called whenever a When is opened as a participant or organiser; a no-op unless switched on. */
  async register(eventId: string): Promise<void> {
    if (!this.wanted() || this.state() !== 'on') return;
    this.subscription ??= await firstValueFrom(this.sw.subscription).catch(() => null);
    if (!this.subscription) return;
    const participantId = this.identity.get(eventId)?.id ?? null;
    const creatorToken = this.identity.creatorToken(eventId);
    if (!participantId && !creatorToken) return;
    await fetch(`/api/events/${encodeURIComponent(eventId)}/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subscription: this.subscription.toJSON(),
        participantId,
        creatorToken,
        timeZone: viewerZone(),
      }),
    }).catch(() => undefined);
  }

  private supported(): boolean {
    return this.sw.isEnabled && 'PushManager' in window && 'Notification' in window;
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

function loadWanted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function saveWanted(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

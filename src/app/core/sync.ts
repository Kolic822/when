import { effect, inject, Service, signal } from '@angular/core';
import { Auth } from './auth';
import { HowToState } from './how-to-state';
import { Identity } from './identity';

interface RemoteWhen {
  id: string;
  title: string;
  dates: string[];
  participantId: string | null;
  name: string;
  creatorToken: string | null;
  at: string;
}

/**
 * Keeps "My Whens" the same on every device signed in with the same account.
 * The account remembers, per When, who the person is in it and whether they organise it;
 * a device that signs in fetches that list and adds what it did not know yet.
 * Guests are untouched: their Whens stay on the device.
 */
@Service()
export class Sync {
  private readonly auth = inject(Auth);
  private readonly identity = inject(Identity);
  private readonly howTo = inject(HowToState);

  /** Bumped after a pull, so lists built from the device's memory refresh. */
  readonly pulled = signal(0);
  private lastSession = '';
  private pulledAt = 0;

  constructor() {
    // On sign-in (and on start-up when already signed in): send what this device knows, then fetch.
    effect(() => {
      const session = this.auth.session();
      if (session === this.lastSession) return;
      this.lastSession = session;
      if (session) void this.exchange();
    });
    // Back in the app: another device (or the browser next to the installed app) may have
    // joined a When meanwhile.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - this.pulledAt < 30_000) return;
      void this.pull();
    });
  }

  /**
   * Fetches what the account knows, but never keeps the person waiting long for it.
   * Used before joining a When, in case another device of theirs already did.
   */
  async ask(): Promise<void> {
    if (!this.auth.session()) return;
    await Promise.race([this.pull(), new Promise((done) => setTimeout(done, 2500))]);
  }

  /** Tells the account about one When this device is part of. */
  async push(eventId: string): Promise<void> {
    const headers = this.auth.authHeader();
    if (!headers['authorization']) return;
    const me = this.identity.get(eventId);
    const creatorToken = this.identity.creatorToken(eventId);
    if (!me && !creatorToken) return;
    try {
      await fetch(`/api/me/whens/${encodeURIComponent(eventId)}`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ participantId: me?.id ?? null, creatorToken }),
      });
    } catch {
      /* offline: the next visit sends it again */
    }
  }

  /** The person deleted or left a When: the account forgets it too. */
  async remove(eventId: string): Promise<void> {
    const headers = this.auth.authHeader();
    if (!headers['authorization']) return;
    await fetch(`/api/me/whens/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => undefined);
  }

  private async exchange(): Promise<void> {
    await this.flush();
    await this.pull();
  }

  /** Makes sure the account knows every When on this device, e.g. before signing out. */
  async flush(): Promise<void> {
    await Promise.race([
      Promise.all(this.identity.recent().map((m) => this.push(m.id))),
      new Promise((done) => setTimeout(done, 2500)),
    ]);
  }

  /** Adds the account's Whens to this device. What the device already knows is left alone. */
  async pull(): Promise<void> {
    const headers = this.auth.authHeader();
    if (!headers['authorization']) return;
    try {
      this.pulledAt = Date.now();
      const res = await fetch('/api/me/whens', { headers });
      // The server no longer knows this session. Nothing on the device is thrown away.
      if (res.status === 401) return this.auth.signOut({ keepWhens: true });
      if (!res.ok) return;
      const known = new Set(this.identity.recent().map((m) => m.id));
      for (const w of (await res.json()) as RemoteWhen[]) {
        if (w.participantId && !this.identity.get(w.id)) {
          this.identity.set(w.id, { id: w.participantId, name: w.name });
          // They have been through the day-by-day view on the device where they joined,
          // and have seen how the app works there.
          this.identity.setStepperDone(w.id);
          this.howTo.markSeen();
        }
        if (w.creatorToken && !this.identity.creatorToken(w.id)) {
          this.identity.setCreatorToken(w.id, w.creatorToken);
        }
        if (!known.has(w.id)) {
          this.identity.remember({
            id: w.id,
            title: w.title,
            dates: w.dates,
            name: w.name,
            role: w.creatorToken ? 'organiser' : 'member',
          });
        }
      }
      this.pulled.update((n) => n + 1);
    } catch {
      /* offline */
    }
  }
}

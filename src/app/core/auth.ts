import { computed, Service, signal } from '@angular/core';
import { t } from './i18n/i18n';

/** Who is using the app on this device. Guests have no account and type their name per When. */
export type User =
  | { kind: 'guest' }
  | { kind: 'google'; name: string; email: string; picture: string; session: string }
  /** Registered with an email and password. */
  | { kind: 'account'; name: string; email: string; session: string };

interface GoogleIdApi {
  initialize(options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const KEY = 'when:user';
const SCRIPT = 'https://accounts.google.com/gsi/client';

/**
 * Entering the app: as a guest, or with a Google account (which supplies the name).
 * Google sign-in only works once the server is given a client id; until then
 * `googleReady()` stays false and the screen offers guest access only.
 */
@Service()
export class Auth {
  readonly user = signal<User | null>(load());
  /** Name to pre-fill wherever the app asks who you are. */
  readonly name = computed(() => {
    const u = this.user();
    return u?.kind === 'google' || u?.kind === 'account' ? u.name : '';
  });

  /** null while unknown, '' when the server has no client id. */
  private readonly clientId = signal<string | null>(null);
  readonly googleReady = computed(() => !!this.clientId());
  readonly checked = computed(() => this.clientId() !== null);

  private configRequest: Promise<void> | null = null;
  private scriptRequest: Promise<void> | null = null;

  /** Asks the server whether Google sign-in is set up. */
  loadConfig(): Promise<void> {
    this.configRequest ??= fetch('/api/config')
      .then((res) => (res.ok ? res.json() : { googleClientId: '' }))
      .then((config: { googleClientId?: string }) => this.clientId.set(config.googleClientId ?? ''))
      .catch(() => this.clientId.set(''));
    return this.configRequest;
  }

  /**
   * Creates an account with an email and password, or signs in to one.
   * Returns '' on success, otherwise a code saying what was wrong.
   */
  async withEmail(
    mode: 'register' | 'login',
    fields: { email: string; username: string; password: string },
  ): Promise<string> {
    try {
      const res = await fetch(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          mode === 'register' ? fields : { login: fields.email, password: fields.password },
        ),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        name?: string;
        email?: string;
        session?: string;
      };
      if (!res.ok || !body.session) return body.error ?? 'failed';
      this.set({
        kind: 'account',
        name: body.name ?? '',
        email: body.email ?? '',
        session: body.session,
      });
      return '';
    } catch {
      return 'offline';
    }
  }

  /** The session of whoever is signed in; empty for guests. */
  readonly session = computed(() => {
    const u = this.user();
    return u?.kind === 'google' || u?.kind === 'account' ? u.session : '';
  });

  continueAsGuest(): void {
    this.set({ kind: 'guest' });
  }

  /**
   * Draws Google's own sign-in button into `host`. `done` is called with true after a
   * successful sign-in, or false when the server rejected it.
   */
  async renderGoogleButton(host: HTMLElement, done: (ok: boolean) => void): Promise<void> {
    await this.loadConfig();
    const clientId = this.clientId();
    if (!clientId) return;
    await this.loadScript();
    const api = window.google?.accounts.id;
    if (!api) return;
    api.initialize({
      client_id: clientId,
      callback: (response) => void this.verify(response.credential).then(done),
    });
    api.renderButton(host, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'center',
      width: Math.min(360, Math.round(host.getBoundingClientRect().width) || 320),
    });
  }

  /** Header that proves to the server which account this device is signed in to. */
  authHeader(): Record<string, string> {
    const u = this.user();
    return u?.kind === 'google' || u?.kind === 'account'
      ? { authorization: `Bearer ${u.session}` }
      : {};
  }

  signOut(): void {
    const headers = this.authHeader();
    if (headers['authorization']) {
      void fetch('/api/auth/signout', { method: 'POST', headers }).catch(() => undefined);
    }
    window.google?.accounts.id.disableAutoSelect();
    this.set(null);
  }

  /** The server checks Google's token; the browser never decides who someone is. */
  private async verify(credential?: string): Promise<boolean> {
    if (!credential) return false;
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      if (!res.ok) return false;
      const profile = (await res.json()) as {
        name: string;
        email: string;
        picture: string;
        session: string;
      };
      this.set({ kind: 'google', ...profile });
      return true;
    } catch {
      return false;
    }
  }

  /** Loads Google's script and returns the client id, or '' when Google is not set up. */
  async ensureGoogle(): Promise<string> {
    await this.loadConfig();
    const clientId = this.clientId();
    if (!clientId) return '';
    await this.loadScript();
    return clientId;
  }

  private loadScript(): Promise<void> {
    this.scriptRequest ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.scriptRequest = null;
        reject(new Error(t('Could not load Google sign-in')));
      };
      document.head.appendChild(script);
    });
    return this.scriptRequest;
  }

  private set(user: User | null): void {
    this.user.set(user);
    try {
      if (user) localStorage.setItem(KEY, JSON.stringify(user));
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode etc. */
    }
  }
}

function load(): User | null {
  try {
    const raw = localStorage.getItem(KEY);
    const user = raw ? (JSON.parse(raw) as User) : null;
    // Signed in before accounts were kept on the server: sign in once more to get a session.
    if (user?.kind === 'google' && !user.session) return null;
    if (user?.kind === 'account' && user.session) return user;
    if (user?.kind === 'guest' || user?.kind === 'google') return user;
    // People who used the app before this screen existed carry on as guests.
    return localStorage.getItem('when:recent') ? { kind: 'guest' } : null;
  } catch {
    return null;
  }
}

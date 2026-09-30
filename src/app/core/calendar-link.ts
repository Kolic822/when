import { computed, inject, Service, signal } from '@angular/core';
import { Auth } from './auth';
import { BusyBlock, sampleBusy } from './busy';
import { t } from './i18n/i18n';
import { addDays } from './time';
import { toUtc, viewerZone, zoneOffset } from './zone';

interface TokenClient {
  requestAccessToken(options?: { prompt?: string; hint?: string }): void;
}
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface OAuthApi {
  initTokenClient(options: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: unknown) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}

/** Only when people are busy: no titles, no guests, nothing else from the calendar. */
const SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';
const KEY = 'when:gcal';

/**
 * Connect calendar: shows the person's own busy times behind the bars.
 *
 * With Google set up on the server, the browser asks Google directly for the
 * busy blocks of the days in view; nothing from the calendar is sent to the
 * When server. Without it, sample events stand in so the feature can be seen.
 */
@Service()
export class CalendarLink {
  private readonly auth = inject(Auth);

  /** Google is configured on the server, so a real calendar can be connected. */
  readonly available = this.auth.googleReady;
  readonly working = signal(false);
  readonly failed = signal(false);

  private readonly token = signal<{ value: string; expires: number } | null>(loadToken());
  readonly connected = computed(() => {
    const token = this.token();
    return !!token && token.expires > Date.now();
  });

  /** Busy blocks by day (in the When's zone) for the range last loaded. */
  private readonly blocks = signal<Record<string, BusyBlock[]>>({});
  private loadedFor = '';

  constructor() {
    void this.auth.loadConfig();
  }

  /** What to draw behind a day's bar, clipped to the hours the When shows. */
  busyOn(date: string, dayStart: number, dayEnd: number): BusyBlock[] {
    if (!this.available()) return sampleBusy(date, dayStart, dayEnd);
    if (!this.connected()) return [];
    return (this.blocks()[date] ?? [])
      .map((b) => ({ ...b, start: Math.max(b.start, dayStart), end: Math.min(b.end, dayEnd) }))
      .filter((b) => b.end > b.start);
  }

  /** Opens Google's permission window; must follow a tap. */
  async connect(): Promise<void> {
    this.failed.set(false);
    this.working.set(true);
    try {
      const clientId = await this.auth.ensureGoogle();
      const oauth = (window.google?.accounts as { oauth2?: OAuthApi } | undefined)?.oauth2;
      if (!clientId || !oauth) throw new Error('Google is not available');
      const user = this.auth.user();
      await new Promise<void>((resolve, reject) => {
        oauth
          .initTokenClient({
            client_id: clientId,
            scope: SCOPE,
            callback: (response) => {
              if (!response.access_token) return reject(new Error(response.error ?? 'denied'));
              const token = {
                value: response.access_token,
                expires: Date.now() + (response.expires_in ?? 3600) * 1000 - 60_000,
              };
              this.token.set(token);
              saveToken(token);
              resolve();
            },
            error_callback: reject,
          })
          .requestAccessToken({ hint: user?.kind === 'google' ? user.email : undefined });
      });
      this.loadedFor = '';
    } catch {
      this.failed.set(true);
    } finally {
      this.working.set(false);
    }
  }

  disconnect(): void {
    const token = this.token();
    const oauth = (window.google?.accounts as { oauth2?: OAuthApi } | undefined)?.oauth2;
    if (token && oauth) oauth.revoke(token.value);
    this.token.set(null);
    saveToken(null);
    this.blocks.set({});
    this.loadedFor = '';
  }

  /** Fetches the busy times for these days; `zone` is the When's zone. */
  async load(dates: string[], zone: string | null): Promise<void> {
    const token = this.token();
    if (!this.connected() || !token || !dates.length) return;
    const where = zone ?? viewerZone();
    const stamp = `${dates[0]}|${dates[dates.length - 1]}|${where}|${token.value.slice(-8)}`;
    if (stamp === this.loadedFor) return;
    this.loadedFor = stamp;
    try {
      const from = toUtc(dates[0], 0, where);
      const to = toUtc(dates[dates.length - 1], 1440, where);
      const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: { authorization: `Bearer ${token.value}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: [{ id: 'primary' }],
        }),
      });
      if (res.status === 401) {
        // The hour is up, or access was withdrawn in the Google account.
        this.token.set(null);
        saveToken(null);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        calendars?: { primary?: { busy?: { start: string; end: string }[] } };
      };
      this.blocks.set(byDay(data.calendars?.primary?.busy ?? [], where, new Set(dates)));
    } catch {
      this.loadedFor = '';
      this.failed.set(true);
    }
  }
}

/** Splits absolute busy intervals into per-day blocks in the given zone. */
export function byDay(
  busy: { start: string; end: string }[],
  zone: string,
  wanted: Set<string>,
): Record<string, BusyBlock[]> {
  const out: Record<string, BusyBlock[]> = {};
  for (const item of busy) {
    let at = local(new Date(item.start), zone);
    const end = local(new Date(item.end), zone);
    // Walk day by day until the end of the interval.
    for (let guard = 0; guard < 62; guard++) {
      const last = at.date === end.date;
      const stop = last ? end.min : 1440;
      if (stop > at.min && wanted.has(at.date)) {
        (out[at.date] ??= []).push({ start: at.min, end: stop, title: t('Busy') });
      }
      if (last) break;
      at = { date: addDays(at.date, 1), min: 0 };
    }
  }
  return out;
}

/** The calendar day and minutes of a moment, as a clock in that zone shows it. */
function local(moment: Date, zone: string): { date: string; min: number } {
  const utcDay = moment.toISOString().slice(0, 10);
  const shifted = new Date(moment.getTime() + zoneOffset(zone, utcDay) * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    min: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function loadToken(): { value: string; expires: number } | null {
  try {
    const token = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as {
      value: string;
      expires: number;
    } | null;
    return token && token.expires > Date.now() ? token : null;
  } catch {
    return null;
  }
}

function saveToken(token: { value: string; expires: number } | null): void {
  try {
    if (token) sessionStorage.setItem(KEY, JSON.stringify(token));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

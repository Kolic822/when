import { computed, inject, Service, signal } from '@angular/core';
import { Auth } from './auth';
import { BusyBlock, sampleAllDay, sampleBusy } from './busy';
import { PrefsStore } from './prefs';
import { t } from './i18n/i18n';
import { addDays } from './time';
import { toUtc, viewerZone, zoneOffset } from './zone';

interface TokenClient {
  requestAccessToken(options?: { prompt?: string; hint?: string }): void;
}
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  /** Space-separated list of what the person actually allowed. */
  scope?: string;
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

/** Read-only: the events, and the list of calendars the person keeps. */
const EVENTS = 'https://www.googleapis.com/auth/calendar.events.readonly';
const LIST = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const SCOPE = `${EVENTS} ${LIST}`;
const API = 'https://www.googleapis.com/calendar/v3';
const KEY = 'when:gcal';

/**
 * Connect calendar: shows the person's own busy times behind the bars.
 *
 * With Google set up on the server, the browser asks Google directly for the
 * events of the days in view; nothing from the calendar is sent to the When
 * server. Without it, sample events stand in so the feature can be seen.
 * Whether names and all-day events are shown is the person's own setting.
 */
@Service()
export class CalendarLink {
  private readonly auth = inject(Auth);
  private readonly store = inject(PrefsStore);

  /** Google is configured on the server, so a real calendar can be connected. */
  readonly available = this.auth.googleReady;
  readonly working = signal(false);
  readonly failed = signal(false);
  /** Why the calendar could not be shown, in words the person can act on. */
  readonly problem = signal<string | null>(null);
  /** How many events were found on the days last loaded; null before the first load. */
  readonly found = signal<number | null>(null);
  /** How many of the person's calendars were read. */
  readonly calendarsRead = signal(0);

  /**
   * Google's permission window has to open in the same instant as the tap, or phones
   * block it as a pop-up. So the client is prepared ahead and only triggered on the tap.
   */
  private client: TokenClient | null = null;
  private pending: { resolve: () => void; reject: (reason: unknown) => void } | null = null;

  private readonly token = signal<{ value: string; expires: number } | null>(loadToken());
  readonly connected = computed(() => {
    const token = this.token();
    return !!token && token.expires > Date.now();
  });

  /** Events by day (in the When's zone) for the range last loaded. */
  private readonly days = signal<CalendarDays>({ timed: {}, allDay: {} });
  private loadedFor = '';

  constructor() {
    void this.prepare();
  }

  /** Loads Google's script and sets the client up, so a later tap can open the window at once. */
  private async prepare(): Promise<TokenClient | null> {
    if (this.client) return this.client;
    const clientId = await this.auth.ensureGoogle().catch(() => '');
    const oauth = (window.google?.accounts as { oauth2?: OAuthApi } | undefined)?.oauth2;
    if (!clientId || !oauth) return null;
    this.client = oauth.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        const waiting = this.pending;
        this.pending = null;
        if (!response.access_token) return waiting?.reject(new Error(response.error ?? 'denied'));
        // Google lets people untick single permissions; without events there is nothing to show.
        if (response.scope && !response.scope.split(' ').includes(EVENTS)) {
          return waiting?.reject(new Error('scope'));
        }
        const token = {
          value: response.access_token,
          expires: Date.now() + (response.expires_in ?? 3600) * 1000 - 60_000,
        };
        this.token.set(token);
        saveToken(token);
        waiting?.resolve();
      },
      error_callback: (error) => {
        const waiting = this.pending;
        this.pending = null;
        waiting?.reject(error);
      },
    });
    return this.client;
  }

  /** Timed events to draw behind a day's bar, clipped to the hours the When shows. */
  busyOn(date: string, dayStart: number, dayEnd: number): BusyBlock[] {
    const names = this.store.prefs().calendarNames;
    const source = !this.available()
      ? sampleBusy(date, dayStart, dayEnd)
      : this.connected()
        ? (this.days().timed[date] ?? [])
        : [];
    return source
      .map((b) => ({
        start: Math.max(b.start, dayStart),
        end: Math.min(b.end, dayEnd),
        title: names ? b.title : t('Busy'),
      }))
      .filter((b) => b.end > b.start);
  }

  /** Names of the events that last the whole of that day; empty when switched off in Settings. */
  allDayOn(date: string): string[] {
    const prefs = this.store.prefs();
    if (!prefs.calendarAllDay) return [];
    const titles = !this.available()
      ? sampleAllDay(date)
      : this.connected()
        ? (this.days().allDay[date] ?? [])
        : [];
    return prefs.calendarNames ? titles : titles.map(() => t('Busy'));
  }

  /** Opens Google's permission window; must follow a tap. */
  async connect(): Promise<void> {
    this.failed.set(false);
    this.problem.set(null);
    this.working.set(true);
    try {
      // Normally ready already, so the window opens within the tap itself.
      const client = this.client ?? (await this.prepare());
      if (!client) throw new Error('unavailable');
      const user = this.auth.user();
      await new Promise<void>((resolve, reject) => {
        this.pending = { resolve, reject };
        client.requestAccessToken({ hint: user?.kind === 'google' ? user.email : undefined });
        // A window that never reports back must not leave the button stuck.
        setTimeout(() => {
          if (this.pending) {
            this.pending = null;
            reject(new Error('timeout'));
          }
        }, 120_000);
      });
      this.loadedFor = '';
    } catch (err) {
      this.failed.set(true);
      const kind = err instanceof Error ? err.message : ((err as { type?: string })?.type ?? '');
      this.problem.set(
        kind === 'scope'
          ? t('Calendar access was not ticked. Connect again and tick the calendar box.')
          : kind === 'unavailable'
            ? t('Google could not be loaded. Check your connection and try again.')
            : t('Google’s window was closed or blocked. Try again.'),
      );
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
    this.days.set({ timed: {}, allDay: {} });
    this.found.set(null);
    this.calendarsRead.set(0);
    this.problem.set(null);
    this.loadedFor = '';
  }

  /** Fetches my events for these days from every calendar I keep; `zone` is the When's zone. */
  async load(dates: string[], zone: string | null): Promise<void> {
    const token = this.token();
    if (!this.connected() || !token || !dates.length) return;
    const where = zone ?? viewerZone();
    const stamp = `${dates[0]}|${dates[dates.length - 1]}|${where}|${token.value.slice(-8)}`;
    if (stamp === this.loadedFor) return;
    this.loadedFor = stamp;
    this.problem.set(null);
    const headers = { authorization: `Bearer ${token.value}` };
    try {
      const query = new URLSearchParams({
        timeMin: toUtc(dates[0], 0, where).toISOString(),
        timeMax: toUtc(dates[dates.length - 1], 1440, where).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        fields: 'items(summary,status,start,end)',
      });
      const calendars = await this.calendarIds(headers);
      this.calendarsRead.set(calendars.length);
      const lists = await Promise.all(
        calendars.map(async (id) => {
          const res = await fetch(`${API}/calendars/${encodeURIComponent(id)}/events?${query}`, {
            headers,
          });
          if (res.ok) return ((await res.json()) as { items?: GoogleEvent[] }).items ?? [];
          // One calendar that can't be read (a shared one, say) shouldn't hide the rest.
          if (id !== 'primary' && res.status !== 401) return [];
          throw await failure(res);
        }),
      );
      const events = lists.flat();
      const wanted = new Set(dates);
      const days = byDay(events, where, wanted);
      this.days.set(days);
      this.found.set(
        Object.values(days.timed).reduce((n, list) => n + list.length, 0) +
          Object.values(days.allDay).reduce((n, list) => n + list.length, 0),
      );
    } catch (err) {
      this.loadedFor = '';
      this.failed.set(true);
      const status = (err as { status?: number }).status;
      if (status === 401) {
        // The hour is up, or access was withdrawn in the Google account.
        this.token.set(null);
        saveToken(null);
        return;
      }
      this.problem.set(err instanceof Error ? err.message : t('Something went wrong'));
    }
  }

  /** The calendars ticked in the person's Google Calendar; just the main one if the list can't be read. */
  private async calendarIds(headers: Record<string, string>): Promise<string[]> {
    try {
      const res = await fetch(
        `${API}/users/me/calendarList?minAccessRole=reader&fields=items(id,selected,primary)`,
        { headers },
      );
      if (!res.ok) return ['primary'];
      const data = (await res.json()) as {
        items?: { id: string; selected?: boolean; primary?: boolean }[];
      };
      const ids = (data.items ?? []).filter((c) => c.selected || c.primary).map((c) => c.id);
      return ids.length ? ids.slice(0, 12) : ['primary'];
    } catch {
      return ['primary'];
    }
  }
}

/** Turns a refused request into a sentence that says what to do about it. */
async function failure(res: Response): Promise<Error & { status: number }> {
  let reason = '';
  let message = '';
  try {
    const body = (await res.json()) as {
      error?: { message?: string; status?: string; errors?: { reason?: string }[] };
    };
    message = body.error?.message ?? '';
    reason = `${body.error?.status ?? ''} ${body.error?.errors?.[0]?.reason ?? ''} ${message}`;
  } catch {
    /* no details */
  }
  let text: string;
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(reason)) {
    text = t('The Google Calendar API is not switched on for this Google Cloud project.');
  } else if (/insufficient|SCOPE/i.test(reason)) {
    text = t('Calendar access was not ticked. Connect again and tick the calendar box.');
  } else {
    text = t('Google refused the request ({code}). {message}', { code: res.status, message });
  }
  return Object.assign(new Error(text), { status: res.status });
}

export interface GoogleEvent {
  summary?: string;
  status?: string;
  /** `dateTime` for timed events, `date` (YYYY-MM-DD) for all-day ones. */
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export interface CalendarDays {
  timed: Record<string, BusyBlock[]>;
  /** Titles of all-day events per day. */
  allDay: Record<string, string[]>;
}

/** Sorts calendar events into the days of a When, in the given zone. */
export function byDay(events: GoogleEvent[], zone: string, wanted: Set<string>): CalendarDays {
  const out: CalendarDays = { timed: {}, allDay: {} };
  for (const event of events) {
    if (event.status === 'cancelled') continue;
    const title = event.summary?.trim() || t('Busy');

    if (event.start?.date && event.end?.date) {
      // All-day: the end date is the day after the last day.
      for (let day = event.start.date, guard = 0; day < event.end.date && guard < 370; guard++) {
        if (wanted.has(day)) (out.allDay[day] ??= []).push(title);
        day = addDays(day, 1);
      }
      continue;
    }
    if (!event.start?.dateTime || !event.end?.dateTime) continue;

    let at = local(new Date(event.start.dateTime), zone);
    const end = local(new Date(event.end.dateTime), zone);
    // Walk day by day until the end of the event.
    for (let guard = 0; guard < 62; guard++) {
      const last = at.date === end.date;
      const stop = last ? end.min : 1440;
      if (stop > at.min && wanted.has(at.date)) {
        (out.timed[at.date] ??= []).push({ start: at.min, end: stop, title });
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

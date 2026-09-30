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

/** Read-only access to the events of the person's calendars. */
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
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

  private readonly token = signal<{ value: string; expires: number } | null>(loadToken());
  readonly connected = computed(() => {
    const token = this.token();
    return !!token && token.expires > Date.now();
  });

  /** Events by day (in the When's zone) for the range last loaded. */
  private readonly days = signal<CalendarDays>({ timed: {}, allDay: {} });
  private loadedFor = '';

  constructor() {
    void this.auth.loadConfig();
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
    this.days.set({ timed: {}, allDay: {} });
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
      const query = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        fields: 'items(summary,status,start,end)',
      });
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`,
        { headers: { authorization: `Bearer ${token.value}` } },
      );
      if (res.status === 401) {
        // The hour is up, or access was withdrawn in the Google account.
        this.token.set(null);
        saveToken(null);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items?: GoogleEvent[] };
      this.days.set(byDay(data.items ?? [], where, new Set(dates)));
    } catch {
      this.loadedFor = '';
      this.failed.set(true);
    }
  }
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

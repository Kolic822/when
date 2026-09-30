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
const LINKS_KEY = 'when:cal-links';

/** One calendar that was read, for the list in Settings. */
export interface CalendarSource {
  /** A calendar of the connected Google account, or one added by link. */
  kind: 'google' | 'link';
  /** The link it was read from (links only). */
  url?: string;
  name: string;
  /** Events it has on the days last loaded. */
  count: number;
  /** Events it holds altogether, when known (calendars added by link). */
  total?: number;
  problem?: string;
}

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
  readonly refreshing = signal(false);
  /** The days last asked for, so they can be fetched again. */
  private last: { dates: string[]; zone: string | null } | null = null;
  private loadedAt = 0;
  readonly failed = signal(false);
  /** Why the calendar could not be shown, in words the person can act on. */
  readonly problem = signal<string | null>(null);
  /** How many events were found on the days last loaded; null before the first load. */
  readonly found = signal<number | null>(null);
  /** Every calendar that was read last time, with what it had. */
  readonly sources = signal<CalendarSource[]>([]);
  readonly calendarsRead = computed(() => this.sources().length);

  /**
   * Calendars added by subscription link (Apple Calendar, Outlook, …). Kept on this
   * device; the server only fetches them on request and stores nothing.
   */
  readonly links = signal<string[]>(loadLinks());
  /** There is something real to show: Google is connected or a link was added. */
  readonly hasSource = computed(() => this.connected() || this.links().length > 0);

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
    // Back in the app after a while: the calendar may have changed meanwhile.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - this.loadedAt > 5 * 60_000) {
        void this.refresh();
      }
    });
  }

  /** Fetches the events again, e.g. after adding something in the calendar app. */
  async refresh(): Promise<void> {
    if (!this.last || this.refreshing() || !this.hasSource()) return;
    this.loadedFor = '';
    this.refreshing.set(true);
    try {
      await this.load(this.last.dates, this.last.zone);
    } finally {
      this.refreshing.set(false);
    }
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
    const source = this.hasSource()
      ? (this.days().timed[date] ?? [])
      : this.available()
        ? []
        : sampleBusy(date, dayStart, dayEnd);
    const timed = source
      .map((b) => ({
        start: Math.max(b.start, dayStart),
        end: Math.min(b.end, dayEnd),
        title: names ? b.title : t('Busy'),
      }))
      .filter((b) => b.end > b.start);
    // All-day events fill the whole bar, as one block behind the timed ones.
    const wholeDay = this.allDayOn(date);
    return wholeDay.length
      ? [
          { start: dayStart, end: dayEnd, title: [...new Set(wholeDay)].join(', '), allDay: true },
          ...timed,
        ]
      : timed;
  }

  /** Names of the events that last the whole of that day; empty when switched off in Settings. */
  allDayOn(date: string): string[] {
    const prefs = this.store.prefs();
    if (!prefs.calendarAllDay) return [];
    const titles = this.hasSource()
      ? (this.days().allDay[date] ?? [])
      : this.available()
        ? []
        : sampleAllDay(date);
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
    this.sources.set([]);
    this.problem.set(null);
    this.loadedFor = '';
  }

  /** Adds a calendar by its subscription link. Returns false when it doesn't look like one. */
  addLink(raw: string): boolean {
    const url = raw.trim().replace(/^webcals?:/i, 'https:');
    if (!/^https:\/\/[^\s/]+\/\S+/.test(url)) return false;
    if (!this.links().includes(url)) {
      this.links.update((list) => [...list, url].slice(0, 5));
      saveLinks(this.links());
    }
    this.loadedFor = '';
    return true;
  }

  removeLink(url: string): void {
    this.links.update((list) => list.filter((l) => l !== url));
    saveLinks(this.links());
    this.loadedFor = '';
    if (!this.hasSource()) {
      this.days.set({ timed: {}, allDay: {} });
      this.found.set(null);
      this.sources.set([]);
    }
  }

  /** Fetches my events for these days from every calendar I have; `zone` is the When's zone. */
  async load(dates: string[], zone: string | null): Promise<void> {
    const token = this.connected() ? this.token() : null;
    const links = this.links();
    this.last = { dates, zone };
    if (!dates.length || (!token && !links.length)) return;
    const where = zone ?? viewerZone();
    const stamp = [dates[0], dates[dates.length - 1], where, token?.value.slice(-8), ...links].join(
      '|',
    );
    if (stamp === this.loadedFor) return;
    this.loadedFor = stamp;
    this.loadedAt = Date.now();
    this.problem.set(null);

    const from = toUtc(dates[0], 0, where);
    const to = toUtc(dates[dates.length - 1], 1440, where);
    const events: GoogleEvent[] = [];
    const sources: CalendarSource[] = [];

    if (token) {
      try {
        await this.fromGoogle(token.value, from, to, events, sources);
      } catch (err) {
        this.failed.set(true);
        if ((err as { status?: number }).status === 401) {
          // The hour is up, or access was withdrawn in the Google account.
          this.token.set(null);
          saveToken(null);
        } else {
          this.problem.set(err instanceof Error ? err.message : t('Something went wrong'));
        }
      }
    }
    for (const link of links) {
      const name = hostOf(link);
      try {
        const { list, total } = await this.fromLink(link, from, to);
        events.push(...list);
        sources.push({ kind: 'link', url: link, name, count: list.length, total });
      } catch (err) {
        sources.push({
          kind: 'link',
          url: link,
          name,
          count: 0,
          problem: err instanceof Error ? err.message : '',
        });
      }
    }

    const days = byDay(events, where, new Set(dates));
    this.days.set(days);
    this.sources.set(sources);
    this.found.set(
      Object.values(days.timed).reduce((n, list) => n + list.length, 0) +
        Object.values(days.allDay).reduce((n, list) => n + list.length, 0),
    );
  }

  private async fromGoogle(
    token: string,
    from: Date,
    to: Date,
    events: GoogleEvent[],
    sources: CalendarSource[],
  ): Promise<void> {
    const headers = { authorization: `Bearer ${token}` };
    const query = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      fields: 'items(summary,status,start,end)',
    });
    for (const calendar of await this.googleCalendars(headers)) {
      const res = await fetch(
        `${API}/calendars/${encodeURIComponent(calendar.id)}/events?${query}`,
        { headers },
      );
      if (res.ok) {
        const items = ((await res.json()) as { items?: GoogleEvent[] }).items ?? [];
        events.push(...items);
        sources.push({ kind: 'google', name: calendar.name, count: items.length });
        continue;
      }
      // One calendar that can't be read (a shared one, say) shouldn't hide the rest.
      if (calendar.id !== 'primary' && !calendar.primary && res.status !== 401) {
        sources.push({
          kind: 'google',
          name: calendar.name,
          count: 0,
          problem: String(res.status),
        });
        continue;
      }
      throw await failure(res);
    }
  }

  /** The calendars ticked in the person's Google Calendar; just the main one if the list can't be read. */
  private async googleCalendars(
    headers: Record<string, string>,
  ): Promise<{ id: string; name: string; primary?: boolean }[]> {
    const fallback = [{ id: 'primary', name: t('Google Calendar'), primary: true }];
    try {
      const res = await fetch(
        `${API}/users/me/calendarList?minAccessRole=reader&fields=items(id,summary,selected,primary)`,
        { headers },
      );
      if (!res.ok) return fallback;
      const data = (await res.json()) as {
        items?: { id: string; summary?: string; selected?: boolean; primary?: boolean }[];
      };
      const list = (data.items ?? [])
        .filter((c) => c.selected || c.primary)
        .map((c) => ({ id: c.id, name: c.summary ?? c.id, primary: c.primary }));
      return list.length ? list.slice(0, 12) : fallback;
    } catch {
      return fallback;
    }
  }

  /** Asks the server to read a subscription link; the link itself is not stored there. */
  private async fromLink(
    url: string,
    from: Date,
    to: Date,
  ): Promise<{ list: GoogleEvent[]; total?: number }> {
    const res = await fetch('/api/calendar/link', {
      method: 'POST',
      headers: { ...this.auth.authHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ url, from: from.toISOString(), to: to.toISOString() }),
    });
    if (!res.ok) {
      const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      throw new Error(
        code === 'not_a_calendar' || code === 'bad_url'
          ? t('That link is not a calendar.')
          : code === 'signed_out'
            ? t('Sign in again to read this calendar.')
            : t('The calendar could not be reached.'),
      );
    }
    const data = (await res.json()) as {
      total?: number;
      events: {
        summary: string;
        start?: string;
        end?: string;
        startDate?: string;
        endDate?: string;
      }[];
    };
    const list = data.events.map((e) =>
      e.startDate
        ? { summary: e.summary, start: { date: e.startDate }, end: { date: e.endDate } }
        : { summary: e.summary, start: { dateTime: e.start }, end: { dateTime: e.end } },
    );
    return { list, total: data.total };
  }
}

/** "p12-caldav.icloud.com" → "iCloud", otherwise the host name. */
function hostOf(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.endsWith('icloud.com')) return 'iCloud';
    if (host.includes('outlook') || host.includes('office')) return 'Outlook';
    return host.replace(/^www\./, '');
  } catch {
    return url;
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

function loadLinks(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(LINKS_KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((l): l is string => typeof l === 'string') : [];
  } catch {
    return [];
  }
}

function saveLinks(links: string[]): void {
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify(links));
  } catch {
    /* ignore */
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

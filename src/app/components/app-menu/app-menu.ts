import { Component, computed, inject, signal, ElementRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Auth } from '../../core/auth';
import { VERSION } from '../../core/changelog';
import { HistoryEntry } from '../../core/models';
import { History } from '../history/history';
import { Push } from '../../core/push';
import { CalendarLink } from '../../core/calendar-link';
import { Identity, RecentMeetup } from '../../core/identity';
import { Features, Look, PrefsStore, Theme } from '../../core/prefs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Updates } from '../../core/updates';
import { HowToState } from '../../core/how-to-state';
import {
  DateStyle,
  HOUR_OPTIONS,
  formatMinutes,
  rangeLabel,
  shortDate,
  toDateKey,
} from '../../core/time';
import {
  dayOf,
  deviceZone,
  setZoneOverride,
  spanAt,
  zoneCity,
  zoneOverride,
} from '../../core/zone';
import { EventApi } from '../../core/event-api';
import { findCommonWindows } from '../../core/availability';
import { DURATIONS } from '../../pages/home/durations';
import { LANGS, Lang, lang, m, setLang, t, tn } from '../../core/i18n/i18n';

/** The ☰ menu: your Whens, appearance and defaults for new Whens. */
@Component({
  selector: 'app-menu',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    History,
  ],
  templateUrl: './app-menu.html',
  styleUrl: './app-menu.scss',
})
export class AppMenu {
  readonly t = t;
  readonly tn = tn;
  private readonly identity = inject(Identity);
  private readonly router = inject(Router);
  readonly store = inject(PrefsStore);
  readonly updates = inject(Updates);
  readonly auth = inject(Auth);
  readonly push = inject(Push);
  readonly calendar = inject(CalendarLink);

  connectCalendar(): void {
    void this.calendar.connect();
  }
  readonly pushFailed = signal(false);

  readonly langs = LANGS;
  readonly lang = lang;

  setLang(value: Lang): void {
    setLang(value);
    this.loadBest();
  }

  // ---- Time zone: the device's own, or one picked by hand (travelling, or to try it out).
  readonly deviceCity = zoneCity(deviceZone);
  readonly zoneOverride = zoneOverride;
  readonly zones: string[] = (
    Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.('timeZone') ?? [deviceZone];

  setZone(value: string): void {
    setZoneOverride(value || null);
    this.loadBest();
  }

  readonly version = VERSION;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Opens the menu on one section, e.g. from the bell at the top of a When. */
  openSection(id: string): void {
    if (!this.open()) this.toggle();
    this.folded.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
    // Twice: the list of Whens above it grows once their details have loaded.
    const reveal = () =>
      this.host.nativeElement
        .querySelector(`[data-section="${id}"]`)
        ?.scrollIntoView({ block: 'start' });
    setTimeout(reveal, 50);
    setTimeout(reveal, 600);
  }

  // ---- History (Pro preview): what happened in any of my Whens.
  readonly historyId = signal<string | null>(null);
  readonly historyEntries = signal<HistoryEntry[] | null>(null);
  readonly historyZone = signal<string | null>(null);
  readonly historyMe = computed(() => {
    const id = this.historyId();
    return id ? (this.identity.get(id)?.id ?? null) : null;
  });

  async showHistory(id: string): Promise<void> {
    this.historyId.set(id);
    this.historyEntries.set(null);
    try {
      const ev = await this.api.get(id);
      if (this.historyId() === id) {
        this.historyZone.set(ev?.timeZone ?? null);
        this.historyEntries.set(ev?.history ?? []);
      }
    } catch {
      if (this.historyId() === id) this.historyEntries.set([]);
    }
  }

  async togglePush(on: boolean): Promise<void> {
    this.pushFailed.set(false);
    if (!on) return this.push.disable();
    const ok = await this.push.enable();
    if (!ok && this.push.state() !== 'blocked') this.pushFailed.set(true);
  }

  signOut(): void {
    this.auth.signOut();
    this.close();
    void this.router.navigate(['/welcome']);
  }

  signIn(): void {
    this.close();
    void this.router.navigate(['/welcome'], { queryParams: { next: this.router.url } });
  }
  private readonly howTo = inject(HowToState);

  showHowTo(): void {
    this.close();
    this.howTo.show();
  }

  private readonly api = inject(EventApi);

  readonly open = signal(false);
  readonly recent = signal<RecentMeetup[]>([]);
  /** Per When: booked or first possible session, '' while loading, or null when none. */
  readonly best = signal<Record<string, string | null>>({});
  readonly prefs = this.store.prefs;

  readonly themes: { value: Theme; label: string; icon: string }[] = [
    { value: 'system', label: m('System'), icon: 'brightness_auto' },
    { value: 'light', label: m('Light'), icon: 'light_mode' },
    { value: 'dark', label: m('Dark'), icon: 'dark_mode' },
  ];
  readonly durations = DURATIONS;
  readonly startOptions = HOUR_OPTIONS.slice(0, 24);
  readonly endOptions = HOUR_OPTIONS.slice(1);
  readonly rangeValid = computed(
    () => this.prefs().dayEnd - this.prefs().dayStart >= this.prefs().durationHours * 60,
  );

  private readonly today = toDateKey(new Date());

  toggle(): void {
    if (!this.open()) {
      this.recent.set(this.identity.recent());
      this.loadBest();
      // History starts on the When that is open, or the most recent one.
      const current = /\/e\/([^/?#]+)/.exec(this.router.url)?.[1];
      const first = this.recent().find((m) => m.id === current) ?? this.recent()[0];
      if (first && this.prefs().features.history) void this.showHistory(first.id);
    }
    this.open.set(!this.open());
  }

  /** Looks up each remembered When: what is booked, or else the first possible session. */
  private async loadBest(): Promise<void> {
    const list = this.recent();
    this.best.set(Object.fromEntries(list.map((m) => [m.id, ''])));
    await Promise.all(
      list.map(async (m) => {
        try {
          const ev = await this.api.get(m.id);
          const windows = ev ? findCommonWindows(ev).windows : [];
          const zone = ev?.timeZone ?? null;
          const booked = ev?.bookings ?? (ev?.booked ? [ev.booked] : []);
          const w = booked[0] ?? windows[0] ?? null;
          const rest = (booked.length || windows.length) - 1;
          const more = rest > 0 ? ' ' + t('+{n} more', { n: rest }) : '';
          const text = w
            ? `${booked.length ? t('Booked') + ' · ' : ''}${shortDate(dayOf(w.date, w.start, zone))} · ${spanAt(w.date, w.start, w.end, zone)}${more}`
            : null;
          this.best.update((b) => ({ ...b, [m.id]: text }));
          if (ev && (ev.title !== m.title || ev.dates.join() !== m.dates.join())) {
            this.identity.remember({ ...m, title: ev.title, dates: ev.dates });
            this.recent.set(this.identity.recent());
          }
        } catch {
          this.best.update((b) => ({ ...b, [m.id]: null }));
        }
      }),
    );
  }

  close(): void {
    this.open.set(false);
  }

  rangeOf(m: RecentMeetup): string {
    return rangeLabel(m.dates);
  }

  isPast(m: RecentMeetup): boolean {
    const last = m.dates[m.dates.length - 1];
    return !!last && last < this.today;
  }

  /** Card whose delete/leave confirmation is showing. */
  readonly confirmId = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);

  askRemove(m: RecentMeetup, e: Event): void {
    e.stopPropagation();
    this.confirmId.set(this.confirmId() === m.id ? null : m.id);
    // The list scrolls; bring the question fully into view.
    setTimeout(() =>
      this.host.nativeElement
        .querySelector('.confirm')
        ?.closest('li')
        ?.scrollIntoView({ block: 'nearest' }),
    );
  }

  isOrganiser(m: RecentMeetup): boolean {
    return !!this.identity.creatorToken(m.id);
  }

  /** Organiser: deletes the When for everyone. Member: leaves it (their answers are removed). */
  async confirmRemove(m: RecentMeetup): Promise<void> {
    this.busyId.set(m.id);
    try {
      const token = this.identity.creatorToken(m.id);
      const me = this.identity.get(m.id);
      if (token) await this.api.remove(m.id, token);
      else if (me) await this.api.leave(m.id, me.id);
    } catch {
      /* best effort – it is forgotten locally either way */
    }
    this.identity.forget(m.id);
    this.identity.clear(m.id);
    this.recent.set(this.identity.recent());
    this.busyId.set(null);
    this.confirmId.set(null);
    if (this.router.url.includes(`/e/${m.id}`)) {
      this.close();
      this.router.navigate(['/']);
    }
  }

  goHome(): void {
    this.close();
    this.router.navigate(['/']);
  }

  setTheme(theme: Theme): void {
    this.store.update({ theme });
  }

  readonly looks: { value: Look; label: string; color: string }[] = [
    { value: 'grape', label: m('Grape'), color: '#6d5ef5' },
    { value: 'sunset', label: m('Sunset'), color: '#f4516c' },
    { value: 'lagoon', label: m('Lagoon'), color: '#00a389' },
  ];

  setLook(look: Look): void {
    this.store.update({ look });
  }

  readonly proFeatures: { key: keyof Features; label: string; hint: string }[] = [
    {
      key: 'connect',
      label: m('Connect calendar'),
      hint: m(
        'See when you are busy behind the bars. Only busy times are read, never what the events are.',
      ),
    },
    {
      key: 'multiBook',
      label: m('Book several sessions'),
      hint: m('The organiser can book more than one session for a When.'),
    },
    {
      key: 'shortlist',
      label: m('Outsource decision'),
      hint: m('Send a link with only the possible sessions.'),
    },
    {
      key: 'calendar',
      label: m('Add to calendar'),
      hint: m('A calendar button on every possible session.'),
    },
    {
      key: 'partial',
      label: m('Join for part of it'),
      hint: m('Let people mark less than the full length.'),
    },
    {
      key: 'history',
      label: m('History'),
      hint: m('A History section in this menu: who changed what, and when.'),
    },
  ];

  /** Sections folded away; settings start folded so My Whens stays on screen. */
  readonly folded = signal<Set<string>>(loadFolded());

  isFolded(id: string): boolean {
    return this.folded().has(id);
  }

  toggleSection(id: string): void {
    this.folded.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      saveFolded(next);
      return next;
    });
  }

  setFeature(key: keyof Features, on: boolean): void {
    this.store.setFeature(key, on);
  }

  readonly dateStyles: { value: DateStyle; label: string }[] = [
    { value: 'numeric', label: '30.9.' },
    { value: 'name', label: '30 Sep' },
  ];

  setDateStyle(dateStyle: DateStyle): void {
    this.store.update({ dateStyle });
  }

  readonly updateText = computed(() => {
    switch (this.updates.status()) {
      case 'unsupported':
        return t('Updates apply automatically when opened in a browser.');
      case 'checking':
        return t('Checking…');
      case 'uptodate':
        return t('You have the latest version.');
      case 'ready':
        return t('A new version is ready.');
      case 'error':
        return t('Could not check right now.');
      default:
        return '';
    }
  });
}

const FOLDED_KEY = 'when:menu-folded-v2';
const FOLDED_DEFAULT = ['look', 'dates', 'defaults', 'history', 'notify', 'pro'];

function loadFolded(): Set<string> {
  try {
    const raw = localStorage.getItem(FOLDED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : FOLDED_DEFAULT);
  } catch {
    return new Set(FOLDED_DEFAULT);
  }
}

function saveFolded(set: Set<string>): void {
  try {
    localStorage.setItem(FOLDED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

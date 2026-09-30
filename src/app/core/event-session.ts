import { computed, inject, Service, signal } from '@angular/core';
import { ClientMessage, EventPatch, MeetEvent, ServerMessage, Slot } from './models';
import { Auth } from './auth';
import { eventZone } from './zone';
import { Identity } from './identity';
import { mergeSlots } from './availability';
import { t } from './i18n/i18n';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

/**
 * Live connection to one event. Holds the shared event state as signals and
 * pushes changes over a WebSocket so every participant sees them instantly.
 */
@Service()
export class EventSession {
  private readonly identity = inject(Identity);
  private readonly auth = inject(Auth);

  readonly event = signal<MeetEvent | null>(null);
  readonly meId = signal<string | null>(null);
  readonly status = signal<ConnectionStatus>('connecting');
  readonly notFound = signal(false);
  /** Set when the server refused a name because someone else already uses it. */
  readonly nameError = signal<string | null>(null);
  /** Ids of participants currently connected. */
  readonly online = signal<ReadonlySet<string>>(new Set());

  readonly me = computed(() => {
    const id = this.meId();
    return id ? (this.event()?.participants.find((p) => p.id === id) ?? null) : null;
  });
  readonly needsName = computed(() => this.event() !== null && this.me() === null);

  private ws: WebSocket | null = null;
  private eventId: string | null = null;
  private pendingName: string | null = null;
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;

  connect(eventId: string): void {
    this.disconnect();
    this.stopped = false;
    this.eventId = eventId;
    this.event.set(null);
    this.notFound.set(false);
    this.online.set(new Set());
    this.meId.set(this.identity.get(eventId)?.id ?? null);
    this.pendingName = this.identity.takePendingName(eventId);
    // Signed in with Google: join under that name straight away instead of asking.
    if (!this.pendingName && !this.meId() && this.auth.name()) this.pendingName = this.auth.name();
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.ws?.close();
    this.ws = null;
  }

  /** Join (or create) a participant with the given name. */
  join(name: string): void {
    this.nameError.set(null);
    this.pendingName = name.trim();
    this.meId.set(null);
    this.sendJoin();
  }

  rename(name: string): void {
    const n = name.trim();
    if (!n) return;
    this.nameError.set(null);
    this.send({ type: 'rename', name: n });
  }

  setSlots(slots: Slot[]): void {
    // Optimistic update so the chart reacts instantly, then sync.
    const id = this.meId();
    this.event.update((ev) =>
      ev && id
        ? { ...ev, participants: ev.participants.map((p) => (p.id === id ? { ...p, slots } : p)) }
        : ev,
    );
    this.send({ type: 'setSlots', slots });
  }

  /** True when my periods cover the whole organiser range on that day. */
  isAllDay(date: string): boolean {
    const ev = this.event();
    const today = (this.me()?.slots ?? []).filter((s) => s.date === date);
    return !!ev && today.length === 1 && today[0].start <= ev.dayStart && today[0].end >= ev.dayEnd;
  }

  /**
   * Marks a whole day free, putting any existing periods for that day aside;
   * switching it off restores them.
   */
  setAllDay(date: string, on: boolean): void {
    const ev = this.event();
    const me = this.me();
    if (!ev || !me || !this.eventId) return;
    const otherDays = me.slots.filter((s) => s.date !== date);
    const today = me.slots.filter((s) => s.date === date);
    if (on) {
      if (today.length && !this.isAllDay(date)) this.identity.stashDay(this.eventId, date, today);
      this.setSlots(mergeSlots([...otherDays, { date, start: ev.dayStart, end: ev.dayEnd }]));
    } else {
      const restored = this.identity.takeStash(this.eventId, date) ?? [];
      this.setSlots(mergeSlots([...otherDays, ...restored]));
    }
  }

  /** Adds my periods from one day to other days; what those days already had is kept (overlaps merge). */
  copyDay(from: string, to: string[]): void {
    const me = this.me();
    if (!me || !to.length) return;
    const targets = new Set(to.filter((d) => d !== from));
    const source = me.slots.filter((s) => s.date === from);
    const copies = [...targets].flatMap((date) => source.map((s) => ({ ...s, date })));
    this.setSlots(mergeSlots([...me.slots, ...copies]));
  }

  /** Adds one period (with its note) to other days; what those days had is kept. */
  copySlot(slot: Slot, to: string[]): void {
    const me = this.me();
    if (!me || !to.length) return;
    const copies = to.filter((d) => d !== slot.date).map((date) => ({ ...slot, date }));
    this.setSlots(mergeSlots([...me.slots, ...copies]));
  }

  /** Removes all my periods on a day, including anything put aside for it. Returns what was removed. */
  clearDay(date: string): Slot[] {
    const me = this.me();
    if (!me || !this.eventId) return [];
    this.identity.takeStash(this.eventId, date);
    const removed = me.slots.filter((s) => s.date === date);
    this.setSlots(me.slots.filter((s) => s.date !== date));
    return removed;
  }

  updateEvent(patch: EventPatch): boolean {
    const token = this.eventId ? this.identity.creatorToken(this.eventId) : null;
    if (!token) return false;
    this.send({ type: 'updateEvent', token, patch });
    return true;
  }

  private open(): void {
    if (!this.eventId) return;
    this.status.set('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${proto}://${location.host}/ws?event=${encodeURIComponent(this.eventId)}`,
    );
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.status.set('online');
      this.sendJoin();
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 25_000);
    };
    ws.onmessage = (e) => this.handle(JSON.parse(e.data) as ServerMessage);
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped || this.notFound()) return;
      this.status.set('offline');
      this.online.set(new Set());
      const delay = Math.min(10_000, 500 * 2 ** this.retries++);
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private sendJoin(): void {
    const id = this.meId();
    if (id) this.send({ type: 'join', participantId: id });
    else if (this.pendingName) this.send({ type: 'join', name: this.pendingName });
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'event': {
        eventZone.set(msg.event.timeZone ?? null);
        this.event.set(msg.event);
        // Keep the remembered name in sync (e.g. after a rename).
        const id = this.meId();
        const me = id ? msg.event.participants.find((p) => p.id === id) : null;
        if (this.eventId && me) {
          this.identity.set(this.eventId, { id: me.id, name: me.name });
          this.identity.remember({
            id: msg.event.id,
            title: msg.event.title,
            dates: msg.event.dates,
            name: me.name,
            role: this.identity.creatorToken(this.eventId) ? 'organiser' : 'member',
          });
        }
        break;
      }
      case 'deleted':
        // The organiser removed this When: stop reconnecting and forget it locally.
        this.stopped = true;
        this.notFound.set(true);
        if (this.eventId) {
          this.identity.forget(this.eventId);
          this.identity.clear(this.eventId);
        }
        break;
      case 'presence':
        this.online.set(new Set(msg.online));
        break;
      case 'nameTaken':
        this.pendingName = null;
        this.nameError.set(
          t('Someone here is already called {name}. Add a last initial or pick another name.', {
            name: msg.name,
          }),
        );
        break;
      case 'joined': {
        this.meId.set(msg.participantId);
        const ev = this.event();
        const name =
          this.pendingName ?? ev?.participants.find((p) => p.id === msg.participantId)?.name ?? '';
        if (this.eventId) this.identity.set(this.eventId, { id: msg.participantId, name });
        this.pendingName = null;
        break;
      }
      case 'needName':
        // Server does not know us any more (e.g. data reset) – ask again.
        if (this.eventId) this.identity.clear(this.eventId);
        this.meId.set(null);
        break;
      case 'error':
        if (msg.code === 'not_found') {
          this.notFound.set(true);
          this.stopped = true;
        }
        break;
      case 'pong':
        break;
    }
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}

/** A free time slot on one day. Minutes from midnight, `end` exclusive (0–1440). */
export interface Slot {
  date: string; // YYYY-MM-DD
  start: number;
  end: number;
  /** Optional remark, e.g. "have to leave 20 min early". */
  note?: string;
}

export interface Participant {
  id: string;
  name: string;
  color: string;
  slots: Slot[];
}

export type HistoryKind =
  | 'joined'
  | 'left'
  | 'renamed'
  | 'added'
  | 'removed'
  | 'changed'
  | 'cleared'
  | 'settings'
  | 'voted'
  | 'unvoted';

/** One line in the event's change log. */
export interface HistoryEntry {
  id: string;
  at: string; // ISO timestamp
  kind: HistoryKind;
  participantId: string | null;
  name: string;
  color: string | null;
  date?: string;
  start?: number;
  end?: number;
  from?: { start: number; end: number };
  /** Extra text: previous name for `renamed`, a summary for `settings`. */
  text?: string;
}

/** A concrete session the organiser can book or put on a shortlist. */
export interface Session {
  date: string;
  start: number;
  end: number;
}

export interface ShortlistAnswer {
  name: string;
  /** Indices into the shortlist's sessions that work for this person. */
  picks: number[];
  /** Chosen start inside a picked session (session index -> minutes), when it is longer than needed. */
  starts?: Record<number, number>;
  at: string;
}

/** A link with only a few sessions, answered with yes/no by people outside the calendar. */
export interface Shortlist {
  id: string;
  mode: 'one' | 'many';
  sessions: Session[];
  /** Meetup length in minutes when the link was made. */
  minutes?: number;
  answers: ShortlistAnswer[];
  createdAt: string;
}

/** What a shortlist link shows to the person answering. */
export interface ShortlistView {
  id: string;
  mode: 'one' | 'many';
  sessions: Session[];
  minutes: number;
  timeZone?: string | null;
  title: string;
  description: string;
  booked: Session | null;
}

export interface MeetEvent {
  id: string;
  title: string;
  /** Optional note from the organiser: where, what to bring, etc. */
  description: string;
  /** The days the organiser put up for selection (sorted YYYY-MM-DD keys). */
  dates: string[];
  durationHours: number;
  /** IANA zone the times are in (the organiser's); absent on Whens from before zones were stored. */
  timeZone?: string | null;
  /** Earliest / latest time of day people can pick, minutes from midnight (e.g. 480–1380). */
  dayStart: number;
  dayEnd: number;
  /**
   * When true, people may mark periods shorter than the meetup and the results
   * count windows where everyone can make at least part of it.
   */
  partialOk: boolean;
  participants: Participant[];
  history: HistoryEntry[];
  /** The session the organiser settled on, if any. */
  booked?: Session | null;
  /** Every booked session; more than one only with the Pro option. `booked` is the first. */
  bookings?: Session[];
  shortlists?: Shortlist[];
  /** A vote (1) per possible session ("date:start:end") and participant. */
  votes?: Record<string, Record<string, 1>>;
  createdAt: string;
}

export interface CreateEventPayload {
  title: string;
  description: string;
  dates: string[];
  durationHours: number;
  dayStart: number;
  dayEnd: number;
  partialOk: boolean;
  timeZone: string;
}

export interface EventPatch {
  title?: string;
  description?: string;
  dates?: string[];
  durationHours?: number;
  dayStart?: number;
  dayEnd?: number;
  partialOk?: boolean;
  booked?: Session | null;
  bookings?: Session[];
}

export const DEFAULT_DAY_START = 8 * 60;
export const DEFAULT_DAY_END = 23 * 60;

/** A window where every participant (who answered) is free. */
export interface CommonWindow {
  date: string;
  start: number;
  end: number;
  /** Names of people who are free for only part of this window (partial-attendance mode). */
  partial?: string[];
  /** Remarks people attached to the periods that make up this window. */
  notes?: { name: string; note: string }[];
}

export type ServerMessage =
  | { type: 'event'; event: MeetEvent }
  | { type: 'joined'; participantId: string }
  | { type: 'needName' }
  | { type: 'nameTaken'; name: string; online?: boolean }
  | { type: 'presence'; online: string[] }
  | { type: 'deleted' }
  | { type: 'error'; code: string }
  | { type: 'pong' };

export type ClientMessage =
  | { type: 'join'; participantId?: string; name?: string; reclaim?: boolean }
  | { type: 'setSlots'; slots: Slot[] }
  | { type: 'rename'; name: string }
  | { type: 'vote'; key: string; value: 1 | 0 }
  | { type: 'updateEvent'; token: string; patch: EventPatch }
  | { type: 'ping' };

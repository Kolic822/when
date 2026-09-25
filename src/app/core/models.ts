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
  'joined' | 'left' | 'renamed' | 'added' | 'removed' | 'changed' | 'cleared' | 'settings';

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

export interface MeetEvent {
  id: string;
  title: string;
  /** Optional note from the organiser: where, what to bring, etc. */
  description: string;
  /** The days the organiser put up for selection (sorted YYYY-MM-DD keys). */
  dates: string[];
  durationHours: number;
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
}

export interface EventPatch {
  title?: string;
  description?: string;
  dates?: string[];
  durationHours?: number;
  dayStart?: number;
  dayEnd?: number;
  partialOk?: boolean;
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
  | { type: 'nameTaken'; name: string }
  | { type: 'presence'; online: string[] }
  | { type: 'deleted' }
  | { type: 'error'; code: string }
  | { type: 'pong' };

export type ClientMessage =
  | { type: 'join'; participantId?: string; name?: string }
  | { type: 'setSlots'; slots: Slot[] }
  | { type: 'rename'; name: string }
  | { type: 'updateEvent'; token: string; patch: EventPatch }
  | { type: 'ping' };

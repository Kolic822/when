import { Service } from '@angular/core';
import { Slot } from './models';

interface StoredIdentity {
  id: string;
  name: string;
}

/** A meetup this browser has created or joined. */
export interface RecentMeetup {
  id: string;
  title: string;
  dates: string[];
  name: string;
  role: 'organiser' | 'member';
  at: string; // ISO, last opened
}

/** Remembers who this browser is for each event (localStorage). */
@Service()
export class Identity {
  private key(eventId: string) {
    return `when:participant:${eventId}`;
  }

  get(eventId: string): StoredIdentity | null {
    try {
      const raw = localStorage.getItem(this.key(eventId));
      return raw ? (JSON.parse(raw) as StoredIdentity) : null;
    } catch {
      return null;
    }
  }

  set(eventId: string, identity: StoredIdentity): void {
    try {
      localStorage.setItem(this.key(eventId), JSON.stringify(identity));
    } catch {
      /* private mode etc. */
    }
  }

  clear(eventId: string): void {
    try {
      localStorage.removeItem(this.key(eventId));
    } catch {
      /* ignore */
    }
  }

  /** Periods put aside while a day is marked "all day", so switching it off brings them back. */
  private stashKey(eventId: string) {
    return `when:stash:${eventId}`;
  }

  private readStash(eventId: string): Record<string, Slot[]> {
    try {
      return JSON.parse(localStorage.getItem(this.stashKey(eventId)) ?? '{}') as Record<
        string,
        Slot[]
      >;
    } catch {
      return {};
    }
  }

  private writeStash(eventId: string, stash: Record<string, Slot[]>): void {
    try {
      if (Object.keys(stash).length)
        localStorage.setItem(this.stashKey(eventId), JSON.stringify(stash));
      else localStorage.removeItem(this.stashKey(eventId));
    } catch {
      /* ignore */
    }
  }

  stashDay(eventId: string, date: string, slots: Slot[]): void {
    const stash = this.readStash(eventId);
    stash[date] = slots;
    this.writeStash(eventId, stash);
  }

  /** Returns and removes the stashed periods for a day, if any. */
  takeStash(eventId: string, date: string): Slot[] | null {
    const stash = this.readStash(eventId);
    const slots = stash[date] ?? null;
    delete stash[date];
    this.writeStash(eventId, stash);
    return slots;
  }

  // ---- Recent meetups, so people can find their way back without an account.
  private readonly recentKey = 'when:recent';

  recent(): RecentMeetup[] {
    try {
      const list = JSON.parse(localStorage.getItem(this.recentKey) ?? '[]') as RecentMeetup[];
      return list.sort((a, b) => b.at.localeCompare(a.at));
    } catch {
      return [];
    }
  }

  remember(entry: Omit<RecentMeetup, 'at'>): void {
    const list = this.recent().filter((r) => r.id !== entry.id);
    list.unshift({ ...entry, at: new Date().toISOString() });
    try {
      localStorage.setItem(this.recentKey, JSON.stringify(list.slice(0, 30)));
    } catch {
      /* ignore */
    }
  }

  forget(id: string): void {
    try {
      localStorage.setItem(
        this.recentKey,
        JSON.stringify(this.recent().filter((r) => r.id !== id)),
      );
    } catch {
      /* ignore */
    }
  }

  /** Whether this browser has been through (or skipped) the first-visit day stepper. */
  stepperDone(eventId: string): boolean {
    try {
      return localStorage.getItem(`when:stepper-done:${eventId}`) === '1';
    } catch {
      return false;
    }
  }

  setStepperDone(eventId: string): void {
    try {
      localStorage.setItem(`when:stepper-done:${eventId}`, '1');
    } catch {
      /* ignore */
    }
  }

  /** The organiser token proves you created the event and may change its dates. */
  creatorToken(eventId: string): string | null {
    try {
      return localStorage.getItem(`when:creator:${eventId}`);
    } catch {
      return null;
    }
  }

  setCreatorToken(eventId: string, token: string): void {
    try {
      localStorage.setItem(`when:creator:${eventId}`, token);
    } catch {
      /* ignore */
    }
  }

  /** Name entered on the create page, used to auto-join right after creating. */
  takePendingName(eventId: string): string | null {
    try {
      const k = `when:pending-name:${eventId}`;
      const v = sessionStorage.getItem(k);
      sessionStorage.removeItem(k);
      return v;
    } catch {
      return null;
    }
  }

  setPendingName(eventId: string, name: string): void {
    try {
      sessionStorage.setItem(`when:pending-name:${eventId}`, name);
    } catch {
      /* ignore */
    }
  }
}

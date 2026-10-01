import { Service } from '@angular/core';
import {
  CreateEventPayload,
  MeetEvent,
  Session,
  Shortlist,
  ShortlistAnswer,
  ShortlistView,
} from './models';
import { t } from './i18n/i18n';

@Service()
export class EventApi {
  async create(payload: CreateEventPayload): Promise<{ event: MeetEvent; creatorToken: string }> {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`${t('Could not create event')} (${res.status})`);
    return res.json();
  }

  /** Organiser only: deletes the When for everyone. */
  async remove(id: string, creatorToken: string): Promise<void> {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-creator-token': creatorToken },
    });
    if (!res.ok && res.status !== 404) throw new Error(`${t('Could not delete')} (${res.status})`);
  }

  /** Removes this participant and their answers from the When. */
  async leave(id: string, participantId: string): Promise<void> {
    const res = await fetch(
      `/api/events/${encodeURIComponent(id)}/participants/${encodeURIComponent(participantId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok && res.status !== 404) throw new Error(`${t('Could not leave')} (${res.status})`);
  }

  /** Organiser only: a link with just these sessions, answered with yes/no. */
  async createShortlist(
    id: string,
    creatorToken: string,
    mode: 'one' | 'many',
    sessions: Session[],
    /** The id the app chose for the link, when it wants to know the address ahead. */
    listId?: string,
  ): Promise<Shortlist> {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}/shortlists`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-creator-token': creatorToken },
      body: JSON.stringify({ mode, sessions, id: listId }),
    });
    if (!res.ok) throw new Error(`${t('Could not create the link')} (${res.status})`);
    return res.json();
  }

  async removeShortlist(id: string, sid: string, creatorToken: string): Promise<void> {
    const res = await fetch(
      `/api/events/${encodeURIComponent(id)}/shortlists/${encodeURIComponent(sid)}`,
      { method: 'DELETE', headers: { 'x-creator-token': creatorToken } },
    );
    if (!res.ok && res.status !== 404)
      throw new Error(`${t('Could not remove the link')} (${res.status})`);
  }

  async getShortlist(sid: string): Promise<ShortlistView | null> {
    const res = await fetch(`/api/shortlists/${encodeURIComponent(sid)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${t('Could not load')} (${res.status})`);
    return res.json();
  }

  async answerShortlist(
    sid: string,
    name: string,
    picks: number[],
    starts: Record<number, number> = {},
  ): Promise<ShortlistAnswer> {
    const res = await fetch(`/api/shortlists/${encodeURIComponent(sid)}/answers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, picks, starts }),
    });
    if (!res.ok) throw new Error(`${t('Could not send your answer')} (${res.status})`);
    return res.json();
  }

  async get(id: string): Promise<MeetEvent | null> {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${t('Could not load event')} (${res.status})`);
    return res.json();
  }
}

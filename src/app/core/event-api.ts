import { Service } from '@angular/core';
import { CreateEventPayload, MeetEvent } from './models';

@Service()
export class EventApi {
  async create(payload: CreateEventPayload): Promise<{ event: MeetEvent; creatorToken: string }> {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Could not create event (${res.status})`);
    return res.json();
  }

  /** Organiser only: deletes the When for everyone. */
  async remove(id: string, creatorToken: string): Promise<void> {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-creator-token': creatorToken },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Could not delete (${res.status})`);
  }

  /** Removes this participant and their answers from the When. */
  async leave(id: string, participantId: string): Promise<void> {
    const res = await fetch(
      `/api/events/${encodeURIComponent(id)}/participants/${encodeURIComponent(participantId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok && res.status !== 404) throw new Error(`Could not leave (${res.status})`);
  }

  async get(id: string): Promise<MeetEvent | null> {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Could not load event (${res.status})`);
    return res.json();
  }
}

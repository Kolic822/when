import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { cleanSubscription, createPush } from './push.mjs';
import { cleanLang, localeOf, say } from './messages.mjs';
import { Accounts } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Hosting platforms set PORT; locally API_PORT keeps the API off the Angular dev server's port.
const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 3000);
const DIST = path.join(__dirname, '..', 'dist', 'when', 'browser');

/** Modern palette; the first unused colour is picked at random. */
const PALETTE = [
  '#6D5EF5', '#FF5C8A', '#00B8A0', '#FF9F1C', '#3D9BFF', '#FF6B4A',
  '#9B5DE5', '#22C55E', '#F15BB5', '#06B6D4', '#E0529C', '#7CB518',
];

const store = new Store(process.env.DATA_FILE ?? path.join(__dirname, 'data', 'events.json'));
const accounts = new Accounts(
  path.join(path.dirname(process.env.DATA_FILE ?? path.join(__dirname, 'data', 'events.json')), 'accounts.json'),
);
await store.load();
await accounts.load();

const app = express();
app.use(express.json());

const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const clampInt = (n, lo, hi, fallback) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
const cleanName = (s) => String(s ?? '').trim().slice(0, 40);
const cleanDescription = (s) => String(s ?? '').trim().slice(0, 600);
const cleanNote = (s) => (typeof s === 'string' ? s.trim().slice(0, 120) : '');
/** A concrete session { date, start, end } or null. */
function cleanSession(s) {
  if (!s || !isDateKey(s.date)) return null;
  const start = clampInt(Number(s.start), 0, 1440, NaN);
  const end = clampInt(Number(s.end), 0, 1440, NaN);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { date: s.date, start, end };
}
const DEFAULT_DAY_START = 8 * 60;
const DEFAULT_DAY_END = 23 * 60;
/** Snaps a time-of-day range to whole hours and keeps it sane (at least one hour long). */
function cleanRange(start, end, fallbackStart = DEFAULT_DAY_START, fallbackEnd = DEFAULT_DAY_END) {
  let s = clampInt(Number(start) / 60, 0, 23, fallbackStart / 60) * 60;
  let e = clampInt(Number(end) / 60, 1, 24, fallbackEnd / 60) * 60;
  if (e <= s) e = Math.min(1440, s + 60);
  return [s, e];
}
/** Sorted, unique, valid date keys – at most 60 days. */
const cleanDates = (list) =>
  Array.isArray(list) ? [...new Set(list.filter(isDateKey))].sort().slice(0, 60) : [];

/** An IANA zone name the runtime knows, or null. */
function cleanZone(zone) {
  if (typeof zone !== 'string' || zone.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

function shortId() {
  // 8 url-safe chars, easy to read aloud
  return randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
}

const HISTORY_MAX = 150;

/** Appends an entry to the event's change history (newest last, capped). */
function record(ev, entry) {
  ev.history ??= [];
  ev.history.push({ id: randomUUID(), at: new Date().toISOString(), ...entry });
  if (ev.history.length > HISTORY_MAX) ev.history.splice(0, ev.history.length - HISTORY_MAX);
}

const who = (p) => ({ participantId: p?.id ?? null, name: p?.name ?? 'Organiser', color: p?.color ?? null });
const sameInterval = (a, b) => a.start === b.start && a.end === b.end;

/** Turns an old→new slot list into human-sized history entries. */
function recordSlotChanges(ev, p, before, after) {
  const dates = [...new Set([...before, ...after].map((s) => s.date))].sort();
  for (const date of dates) {
    let old = before.filter((s) => s.date === date);
    let cur = after.filter((s) => s.date === date);
    // Ignore intervals that did not change.
    const keptOld = old.filter((o) => cur.some((c) => sameInterval(o, c)));
    old = old.filter((o) => !keptOld.includes(o));
    cur = cur.filter((c) => !keptOld.some((k) => sameInterval(k, c)));
    if (!old.length && !cur.length) continue;
    const base = { ...who(p), date };
    if (old.length === 1 && cur.length === 1) {
      record(ev, { ...base, kind: 'changed', from: { start: old[0].start, end: old[0].end }, start: cur[0].start, end: cur[0].end });
    } else if (old.length > 1 && cur.length === 0) {
      record(ev, { ...base, kind: 'cleared' });
    } else {
      for (const s of old) record(ev, { ...base, kind: 'removed', start: s.start, end: s.end });
      for (const s of cur) record(ev, { ...base, kind: 'added', start: s.start, end: s.end });
    }
  }
}

function publicEvent(ev) {
  // The organiser's token and people's push subscriptions never leave the server.
  const { creatorToken, push, ...rest } = ev;
  return rest;
}

// Backfill fields added after the first version.
for (const ev of store.all()) {
  ev.history ??= [];
  ev.description ??= '';
  ev.partialOk ??= false;
  ev.booked ??= null;
  ev.shortlists ??= [];
  ev.push ??= [];
  ev.bookings ??= ev.booked ? [ev.booked] : [];
  if (ev.dayStart === undefined || ev.dayEnd === undefined) {
    [ev.dayStart, ev.dayEnd] = cleanRange(ev.dayStart, ev.dayEnd);
    for (const p of ev.participants) p.slots = sanitizeSlots(ev, p.slots);
    store.set(ev);
  }
}

// ---- Abuse protection: a public address needs a cap on how fast anyone can create things.
app.set('trust proxy', 1); // behind the host's proxy, so req.ip is the visitor
const hits = new Map(); // ip -> timestamps of recent writes
const WINDOW_MS = 10 * 60 * 1000;
const MAX_WRITES = 40;
function limitWrites(req, res, next) {
  const now = Date.now();
  const recent = (hits.get(req.ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_WRITES) {
    return res.status(429).json({ error: 'too_many_requests' });
  }
  recent.push(now);
  hits.set(req.ip, recent);
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) {
    if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(ip);
  }
}, WINDOW_MS).unref();
app.post(/^\/api\//, limitWrites);

app.post('/api/events', (req, res) => {
  const body = req.body ?? {};
  const title = String(body.title ?? '').trim().slice(0, 80) || 'Meetup';
  const description = cleanDescription(body.description);
  const dates = cleanDates(body.dates);
  if (dates.length === 0) return res.status(400).json({ error: 'no_dates' });
  const [dayStart, dayEnd] = cleanRange(body.dayStart, body.dayEnd);
  const partialOk = body.partialOk === true;
  const timeZone = cleanZone(body.timeZone);
  const durationHours = Math.min((dayEnd - dayStart) / 60, Math.max(0.5, Number(body.durationHours) || 3));

  let id = shortId();
  while (store.get(id)) id = shortId();

  const event = {
    id,
    title,
    description,
    dates,
    durationHours,
    dayStart,
    dayEnd,
    partialOk,
    timeZone,
    participants: [],
    history: [],
    booked: null,
    bookings: [],
    shortlists: [],
    push: [],
    createdAt: new Date().toISOString(),
    creatorToken: randomUUID(),
  };
  store.set(event);
  res.status(201).json({ event: publicEvent(event), creatorToken: event.creatorToken });
});

/** Organiser deletes the whole When; everyone connected is told and disconnected. */
app.delete('/api/events/:id', (req, res) => {
  const ev = store.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  const token = req.get('x-creator-token');
  if (!token || token !== ev.creatorToken) return res.status(403).json({ error: 'forbidden' });
  store.delete(ev.id);
  const payload = JSON.stringify({ type: 'deleted' });
  for (const client of rooms.get(ev.id) ?? []) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
      client.close();
    }
  }
  rooms.delete(ev.id);
  res.status(204).end();
});

/** A participant leaves: their answers are removed and they lose their seat. */
app.delete('/api/events/:id/participants/:pid', (req, res) => {
  const ev = store.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  const p = ev.participants.find((x) => x.id === req.params.pid);
  if (!p) return res.status(404).json({ error: 'not_found' });
  ev.participants = ev.participants.filter((x) => x.id !== p.id);
  record(ev, { ...who(p), kind: 'left' });
  store.set(ev);
  for (const client of rooms.get(ev.id) ?? []) {
    if (client.participantId === p.id) client.participantId = null;
  }
  broadcast(ev.id);
  broadcastPresence(ev.id);
  res.status(204).end();
});

// ---- Housekeeping: old Whens go, a snapshot of the rest is kept.
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Removes Whens whose last day is longer ago than the retention period. */
function removeOld() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
  let removed = 0;
  for (const ev of store.all()) {
    const last = ev.dates[ev.dates.length - 1] ?? ev.createdAt.slice(0, 10);
    if (last < cutoff) {
      store.delete(ev.id);
      rooms.delete(ev.id);
      removed++;
    }
  }
  if (removed) console.log(`removed ${removed} When(s) older than ${RETENTION_DAYS} days`);
}

async function housekeeping() {
  try {
    removeOld();
    await store.backup();
  } catch (err) {
    console.error('housekeeping failed', err);
  }
}
setTimeout(housekeeping, 5000);
setInterval(housekeeping, DAY_MS).unref();

/** The whole data set, for keeping a copy elsewhere. Needs ADMIN_TOKEN to be set. */
app.get('/api/admin/export', (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.get('x-admin-token') !== token) return res.status(403).json({ error: 'forbidden' });
  res.setHeader('content-disposition', `attachment; filename="when-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(store.all());
});

// ---- Signing in with Google
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';

/** What the app needs to know before it starts; empty client id means guests only. */
app.get('/api/config', (_req, res) => res.json({ googleClientId: GOOGLE_CLIENT_ID }));

/** Checks the token Google gave the browser and returns the person's name. */
app.post('/api/auth/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'not_configured' });
  const credential = String(req.body?.credential ?? '');
  if (!credential || credential.length > 4096) return res.status(400).json({ error: 'bad_token' });
  try {
    const check = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    );
    if (!check.ok) return res.status(401).json({ error: 'invalid_token' });
    const info = await check.json();
    const issuer = ['accounts.google.com', 'https://accounts.google.com'].includes(info.iss);
    const fresh = Number(info.exp) * 1000 > Date.now();
    if (info.aud !== GOOGLE_CLIENT_ID || !issuer || !fresh) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    const profile = {
      name: cleanName(info.given_name || info.name || String(info.email ?? '').split('@')[0]),
      email: String(info.email ?? ''),
      picture: String(info.picture ?? ''),
    };
    // A session for this device, so its Whens follow the account to other devices.
    const session = accounts.signIn({ sub: String(info.sub), email: profile.email, name: profile.name });
    res.json({ ...profile, session });
  } catch {
    res.status(502).json({ error: 'google_unreachable' });
  }
});

// ---- My Whens, the same on every device signed in with the same Google account.
function account(req) {
  const header = req.get('authorization') ?? '';
  return accounts.bySession(header.startsWith('Bearer ') ? header.slice(7) : '');
}

app.post('/api/auth/signout', (req, res) => {
  const header = req.get('authorization') ?? '';
  accounts.signOut(header.startsWith('Bearer ') ? header.slice(7) : '');
  res.status(204).end();
});

app.get('/api/me/whens', (req, res) => {
  const me = account(req);
  if (!me) return res.status(401).json({ error: 'signed_out' });
  const list = [];
  for (const [id, entry] of Object.entries(me.whens)) {
    const ev = store.get(id);
    if (!ev) {
      accounts.forget(me, id);
      continue;
    }
    const participant = ev.participants.find((p) => p.id === entry.participantId);
    list.push({
      id,
      title: ev.title,
      dates: ev.dates,
      participantId: participant ? participant.id : null,
      name: participant ? participant.name : entry.name,
      creatorToken: entry.creatorToken === ev.creatorToken ? entry.creatorToken : null,
      at: entry.at,
    });
  }
  res.json(list);
});

app.put('/api/me/whens/:id', (req, res) => {
  const me = account(req);
  if (!me) return res.status(401).json({ error: 'signed_out' });
  const ev = store.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  const participant = ev.participants.find((p) => p.id === req.body?.participantId);
  const creatorToken = req.body?.creatorToken === ev.creatorToken ? ev.creatorToken : null;
  if (!participant && !creatorToken) return res.status(400).json({ error: 'nothing_to_remember' });
  const entry = accounts.remember(me, ev.id, {
    participantId: participant?.id ?? null,
    name: participant?.name ?? '',
    creatorToken,
  });
  res.json({ participantId: entry.participantId, name: entry.name, organiser: !!entry.creatorToken });
});

app.delete('/api/me/whens/:id', (req, res) => {
  const me = account(req);
  if (!me) return res.status(401).json({ error: 'signed_out' });
  accounts.forget(me, req.params.id);
  res.status(204).end();
});

// ---- Push notifications
const DATA_FILE = process.env.DATA_FILE ?? path.join(__dirname, 'data', 'events.json');
const push = createPush(DATA_FILE);
const MAX_SUBSCRIPTIONS = 60;

/** Notifies the people of a When who asked for it; `pick` chooses who. */
/**
 * Notifies the people of a When who asked for it; `pick` chooses who. `build` writes the
 * message with two helpers: `say(key, params, count)` for text in the reader's language
 * and `when(session)` for a session in the reader's language and time zone.
 */
async function notify(ev, pick, build) {
  const targets = (ev.push ?? []).filter(pick);
  if (!targets.length) return;
  const groups = new Map();
  for (const t of targets) {
    const key = `${t.timeZone ?? ''}|${cleanLang(t.lang)}`;
    if (!groups.has(key)) groups.set(key, { zone: t.timeZone ?? null, lang: cleanLang(t.lang), subs: [] });
    groups.get(key).subs.push(t.sub);
  }
  const gone = [];
  for (const { zone, lang, subs } of groups.values()) {
    const message = build({
      say: (key, params, count) => say(lang, key, params, count),
      when: (session) => sessionText(session, ev.timeZone, zone, lang),
    });
    if (process.env.PUSH_DEBUG) {
      console.log('notify', subs.map((x) => x.endpoint.split('/').pop()), zone ?? '-', lang, JSON.stringify(message));
    }
    gone.push(...(await push.send(subs, { ...message, url: `/e/${ev.id}` })));
  }
  if (gone.length) {
    ev.push = ev.push.filter((t) => !gone.includes(t.sub.endpoint));
    store.set(ev);
  }
}

/** How many windows fit everyone: the same rule as the app, kept simple for a notification. */
function findCommonCount(ev) {
  const need = Math.round(ev.durationHours * 60);
  let count = 0;
  for (const date of ev.dates) {
    let windows = [{ start: ev.dayStart, end: ev.dayEnd }];
    for (const p of ev.participants) {
      const mine = p.slots.filter((s) => s.date === date);
      windows = windows.flatMap((w) =>
        mine.map((s) => ({ start: Math.max(w.start, s.start), end: Math.min(w.end, s.end) })).filter((x) => x.end > x.start),
      );
    }
    count += windows.filter((w) => w.end - w.start >= need).length;
  }
  return count;
}

/** Minutes a zone is ahead of UTC on that day (at noon). */
function zoneOffset(zone, date) {
  const at = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(at);
  const n = (type) => Number(parts.find((p) => p.type === type)?.value);
  return Math.round((Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute')) - at.getTime()) / 60_000);
}

/** "Wed 7 Oct, 10:00 – 13:00", converted from the When's zone to the reader's when both are known. */
function sessionText(s, from = null, to = null, lang = 'en') {
  const shift = from && to && from !== to ? zoneOffset(to, s.date) - zoneOffset(from, s.date) : 0;
  const start = s.start + shift;
  const days = Math.floor(start / 1440);
  const d = new Date(`${s.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const day = d.toLocaleDateString(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const wrap = (m) => ((m % 1440) + 1440) % 1440;
  const end = s.end + shift - days * 1440;
  return `${day}, ${fmt(wrap(start))} – ${end === 1440 ? '24:00' : fmt(wrap(end))}`;
}

app.get('/api/push/key', (_req, res) => res.json({ publicKey: push.publicKey }));

/** This browser wants notifications for this When. */
app.post('/api/events/:id/push', (req, res) => {
  const ev = store.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  const sub = cleanSubscription(req.body?.subscription);
  if (!sub) return res.status(400).json({ error: 'bad_subscription' });
  const participantId = ev.participants.some((p) => p.id === req.body?.participantId)
    ? req.body.participantId
    : null;
  const organiser = !!req.body?.creatorToken && req.body.creatorToken === ev.creatorToken;
  if (!participantId && !organiser) return res.status(403).json({ error: 'forbidden' });
  ev.push = (ev.push ?? []).filter((t) => t.sub.endpoint !== sub.endpoint);
  if (ev.push.length >= MAX_SUBSCRIPTIONS) return res.status(409).json({ error: 'too_many' });
  ev.push.push({
    participantId,
    organiser,
    sub,
    timeZone: cleanZone(req.body?.timeZone),
    lang: cleanLang(req.body?.lang),
  });
  store.set(ev);
  res.status(201).json({ ok: true });
});

/** This browser no longer wants them. */
app.delete('/api/events/:id/push', (req, res) => {
  const ev = store.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  const endpoint = String(req.body?.endpoint ?? '');
  ev.push = (ev.push ?? []).filter((t) => t.sub.endpoint !== endpoint);
  store.set(ev);
  res.status(204).end();
});

// ---- Shortlists: a link with only a few sessions, for someone who just answers yes/no.
function findShortlist(sid) {
  for (const ev of store.all()) {
    const list = (ev.shortlists ?? []).find((s) => s.id === sid);
    if (list) return { ev, list };
  }
  return null;
}

app.post('/api/events/:id/shortlists', (req, res) => {
  const ev = store.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  const token = req.get('x-creator-token');
  if (!token || token !== ev.creatorToken) return res.status(403).json({ error: 'forbidden' });
  const sessions = (Array.isArray(req.body?.sessions) ? req.body.sessions : [])
    .map(cleanSession)
    .filter(Boolean)
    .slice(0, 12);
  if (!sessions.length) return res.status(400).json({ error: 'no_sessions' });
  let id = shortId();
  while (findShortlist(id)) id = shortId();
  const list = {
    id,
    mode: req.body?.mode === 'one' ? 'one' : 'many',
    sessions,
    // Meetup length when the link was made; longer sessions let people choose a start.
    minutes: Math.round(ev.durationHours * 60),
    answers: [],
    createdAt: new Date().toISOString(),
  };
  ev.shortlists ??= [];
  ev.shortlists.push(list);
  store.set(ev);
  broadcast(ev.id);
  res.status(201).json(list);
});

/** The organiser withdraws a link, e.g. sent to the wrong person. Answers on it go too. */
app.delete('/api/events/:id/shortlists/:sid', (req, res) => {
  const ev = store.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  const token = req.get('x-creator-token');
  if (!token || token !== ev.creatorToken) return res.status(403).json({ error: 'forbidden' });
  const before = ev.shortlists?.length ?? 0;
  ev.shortlists = (ev.shortlists ?? []).filter((s) => s.id !== req.params.sid);
  if (ev.shortlists.length === before) return res.status(404).json({ error: 'not_found' });
  store.set(ev);
  broadcast(ev.id);
  res.status(204).end();
});

app.get('/api/shortlists/:sid', (req, res) => {
  const found = findShortlist(req.params.sid);
  if (!found) return res.status(404).json({ error: 'not_found' });
  const { ev, list } = found;
  res.json({
    id: list.id,
    mode: list.mode,
    sessions: list.sessions,
    minutes: list.minutes ?? Math.round(ev.durationHours * 60),
    timeZone: ev.timeZone ?? null,
    title: ev.title,
    description: ev.description ?? '',
    booked: ev.booked ?? null,
  });
});

app.post('/api/shortlists/:sid/answers', (req, res) => {
  const found = findShortlist(req.params.sid);
  if (!found) return res.status(404).json({ error: 'not_found' });
  const { ev, list } = found;
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'no_name' });
  let picks = [...new Set((Array.isArray(req.body?.picks) ? req.body.picks : []).map(Number))]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < list.sessions.length)
    .sort((a, b) => a - b);
  if (list.mode === 'one') picks = picks.slice(0, 1);
  // Optional start time per picked session, when the session is longer than the meetup.
  const minutes = list.minutes ?? Math.round(ev.durationHours * 60);
  const starts = {};
  for (const i of picks) {
    const s = list.sessions[i];
    const start = Number(req.body?.starts?.[i]);
    if (!Number.isInteger(start) || start % 15 !== 0) continue;
    if (start >= s.start && start + Math.min(minutes, s.end - s.start) <= s.end) starts[i] = start;
  }
  const answer = { name, picks, starts, at: new Date().toISOString() };
  const i = list.answers.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
  const previous = i >= 0 ? list.answers[i] : null;
  if (i >= 0) list.answers[i] = answer;
  else list.answers.push(answer);
  store.set(ev);
  broadcast(ev.id);
  const withdrew = previous?.picks.length && !picks.length;
  void notify(ev, (t) => t.organiser, ({ say, when }) => ({
    title: say(withdrew ? 'withdrew' : previous ? 'changed' : 'answered', { name, title: ev.title }),
    body: picks.length
      ? say('works', { sessions: picks.map((p) => when(list.sessions[p])).join('; ') })
      : say('none_work'),
  }));
  res.status(201).json(answer);
});

app.get('/api/events/:id', (req, res) => {
  const ev = store.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  res.json(publicEvent(ev));
});

// Serve the built Angular app (after `npm run build`), with SPA fallback.
if (existsSync(DIST)) {
  app.use(express.static(DIST, { index: 'index.html' }));
  app.get(/^(?!\/api|\/ws).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** eventId -> Set<ws> */
const rooms = new Map();

function join(room, ws) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
}
function leave(room, ws) {
  rooms.get(room)?.delete(ws);
  if (rooms.get(room)?.size === 0) rooms.delete(room);
}
function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(eventId) {
  const ev = store.get(eventId);
  if (!ev) return;
  const payload = JSON.stringify({ type: 'event', event: publicEvent(ev) });
  for (const client of rooms.get(eventId) ?? []) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

/** True when another participant already uses this name (case-insensitive). */
function nameTaken(ev, name, exceptId = null) {
  const n = name.toLowerCase();
  return ev.participants.some((p) => p.id !== exceptId && p.name.toLowerCase() === n);
}

/** Participant ids with at least one open connection to this event. */
function onlineIds(eventId) {
  const ids = new Set();
  for (const client of rooms.get(eventId) ?? []) {
    if (client.readyState === client.OPEN && client.participantId) ids.add(client.participantId);
  }
  return [...ids];
}

function broadcastPresence(eventId) {
  const payload = JSON.stringify({ type: 'presence', online: onlineIds(eventId) });
  for (const client of rooms.get(eventId) ?? []) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

function pickColor(ev) {
  const used = new Set(ev.participants.map((p) => p.color));
  const free = PALETTE.filter((c) => !used.has(c));
  const pool = free.length ? free : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

function sanitizeSlots(ev, slots) {
  if (!Array.isArray(slots)) return [];
  const byDate = new Map();
  for (const s of slots) {
    if (!s || !isDateKey(s.date)) continue;
    const start = clampInt(Number(s.start), ev.dayStart, ev.dayEnd, ev.dayStart);
    const end = clampInt(Number(s.end), ev.dayStart, ev.dayEnd, ev.dayStart);
    if (end - start < 15) continue;
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    const note = cleanNote(s.note);
    byDate.get(s.date).push(note ? { date: s.date, start, end, note } : { date: s.date, start, end });
  }
  // merge overlaps per day, keep it tidy
  const out = [];
  for (const [, list] of byDate) {
    list.sort((a, b) => a.start - b.start);
    let cur = null;
    for (const s of list) {
      if (cur && s.start <= cur.end) {
        cur.end = Math.max(cur.end, s.end);
        if (!cur.note && s.note) cur.note = s.note;
      } else { if (cur) out.push(cur); cur = { ...s }; }
    }
    if (cur) out.push(cur);
  }
  const minLen = ev.partialOk ? 15 : Math.min(Math.round(ev.durationHours * 60), ev.dayEnd - ev.dayStart);
  const long = out.filter((s) => s.end - s.start >= minLen);
  long.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start));
  return long.slice(0, 500);
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const eventId = url.searchParams.get('event') ?? '';
  const ev = store.get(eventId);
  if (!ev) {
    send(ws, { type: 'error', code: 'not_found' });
    ws.close();
    return;
  }
  ws.eventId = eventId;
  ws.participantId = null;
  join(eventId, ws);
  send(ws, { type: 'event', event: publicEvent(ev) });
  send(ws, { type: 'presence', online: onlineIds(eventId) });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    const ev = store.get(ws.eventId);
    if (!ev || !msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'join': {
        // Re-join with an existing id, or create a new participant.
        let p = msg.participantId ? ev.participants.find((x) => x.id === msg.participantId) : null;
        if (!p) {
          const name = cleanName(msg.name);
          if (!name) { send(ws, { type: 'needName' }); return; }
          if (nameTaken(ev, name)) { send(ws, { type: 'nameTaken', name }); return; }
          p = { id: randomUUID(), name, color: pickColor(ev), slots: [] };
          ev.participants.push(p);
          ev.notifiedComplete = false;
          record(ev, { ...who(p), kind: 'joined' });
          store.set(ev);
        }
        ws.participantId = p.id;
        send(ws, { type: 'joined', participantId: p.id });
        broadcast(ev.id);
        broadcastPresence(ev.id);
        break;
      }
      case 'setSlots': {
        const p = ev.participants.find((x) => x.id === ws.participantId);
        if (!p) { send(ws, { type: 'needName' }); return; }
        const before = p.slots;
        p.slots = sanitizeSlots(ev, msg.slots);
        recordSlotChanges(ev, p, before, p.slots);
        // The last person to answer completes the picture: tell the others once.
        const everyone = ev.participants.length >= 2 && ev.participants.every((x) => x.slots.length);
        if (everyone && !before.length && p.slots.length && !ev.notifiedComplete) {
          ev.notifiedComplete = true;
          const n = findCommonCount(ev);
          void notify(ev, (t) => t.participantId !== p.id, ({ say }) => ({
            title: say('everyone', { title: ev.title }),
            body: n ? say('possible', { n }, n) : say('none_fit'),
          }));
        }
        store.set(ev);
        broadcast(ev.id);
        break;
      }
      case 'rename': {
        const p = ev.participants.find((x) => x.id === ws.participantId);
        const name = cleanName(msg.name);
        if (!p || !name || p.name === name) return;
        if (nameTaken(ev, name, p.id)) { send(ws, { type: 'nameTaken', name }); return; }
        const oldName = p.name;
        p.name = name;
        record(ev, { ...who(p), kind: 'renamed', text: oldName });
        store.set(ev);
        broadcast(ev.id);
        break;
      }
      case 'updateEvent': {
        if (!msg.token || msg.token !== ev.creatorToken) {
          send(ws, { type: 'error', code: 'forbidden' });
          return;
        }
        const patch = msg.patch ?? {};
        if (patch.dates !== undefined) {
          const dates = cleanDates(patch.dates);
          if (dates.length) ev.dates = dates;
        }
        if (patch.durationHours !== undefined) {
          ev.durationHours = Math.min(24, Math.max(0.5, Number(patch.durationHours) || ev.durationHours));
        }
        if (typeof patch.title === 'string' && patch.title.trim()) ev.title = patch.title.trim().slice(0, 80);
        if (typeof patch.description === 'string') ev.description = cleanDescription(patch.description);
        if (typeof patch.partialOk === 'boolean') ev.partialOk = patch.partialOk;
        // One booked session, or several (a Pro feature); `booked` stays the first for older clients.
        const before = ev.bookings ?? [];
        if (patch.bookings !== undefined || patch.booked !== undefined) {
          const wanted = patch.bookings !== undefined ? patch.bookings : [patch.booked];
          // One session per day: a later one for the same day replaces the earlier.
          const byDay = new Map();
          for (const s of (Array.isArray(wanted) ? wanted : []).map(cleanSession)) {
            if (s) byDay.set(s.date, s);
          }
          ev.bookings = [...byDay.values()]
            .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
            .slice(0, 12);
          ev.booked = ev.bookings[0] ?? null;
        }
        const key = (s) => JSON.stringify(s);
        const added = ev.bookings.filter((s) => !before.some((b) => key(b) === key(s)));
        const removed = before.filter((b) => !ev.bookings.some((s) => key(b) === key(s)));
        if (added.length || removed.length) {
          // Everyone but the organiser, who just did it.
          const others = (t) => !t.organiser && t.participantId !== ws.participantId;
          if (added.length === 1 && removed.length === 1) {
            void notify(ev, others, ({ say, when }) => ({
              title: say('moved', { title: ev.title }),
              body: say('now', { session: when(added[0]) }),
            }));
          } else if (added.length) {
            void notify(ev, others, ({ say, when }) => ({
              title: say(before.length ? 'another' : 'booked', { title: ev.title }),
              body: added.map(when).join('; '),
            }));
          } else if (!ev.bookings.length) {
            void notify(ev, others, ({ say }) => ({
              title: say('unbooked', { title: ev.title }),
              body: say('cancelled_body'),
            }));
          } else {
            void notify(ev, others, ({ say, when }) => ({
              title: say('one_cancelled', { title: ev.title }),
              body: removed.map(when).join('; '),
            }));
          }
        }
        if (patch.dayStart !== undefined || patch.dayEnd !== undefined) {
          [ev.dayStart, ev.dayEnd] = cleanRange(patch.dayStart ?? ev.dayStart, patch.dayEnd ?? ev.dayEnd, ev.dayStart, ev.dayEnd);
        }
        ev.durationHours = Math.min(ev.durationHours, (ev.dayEnd - ev.dayStart) / 60);
        // A longer meetup or a narrower day can invalidate existing answers.
        for (const p of ev.participants) {
          const before = p.slots;
          p.slots = sanitizeSlots(ev, p.slots);
          recordSlotChanges(ev, p, before, p.slots);
        }
        record(ev, {
          ...who(ev.participants.find((x) => x.id === ws.participantId)),
          kind: 'settings',
          text: `${ev.dates.length} day${ev.dates.length === 1 ? '' : 's'}, ${ev.durationHours} h, ${fmt(ev.dayStart)}–${fmt(ev.dayEnd)}${ev.partialOk ? ', partial ok' : ''}`,
        });
        store.set(ev);
        broadcast(ev.id);
        break;
      }
      case 'ping':
        send(ws, { type: 'pong' });
        break;
    }
  });

  ws.on('close', () => {
    leave(ws.eventId, ws);
    if (ws.participantId) broadcastPresence(ws.eventId);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`when server listening on http://localhost:${PORT}` + (existsSync(DIST) ? ' (serving dist)' : ' (API + WS only; run "ng serve" for the UI)'));
});

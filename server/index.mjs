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
import { eventsBetween, fetchCalendar } from './ics.mjs';
import { calendarFeed, calendarFile } from './calendar-file.mjs';
import { createMailer } from './mail.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Hosting platforms set PORT; locally API_PORT keeps the API off the Angular dev server's port.
const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 3000);
const DIST = path.join(__dirname, '..', 'dist', 'when', 'browser');

/** Modern palette; the first unused colour is picked at random. */
const PALETTE = [
  '#6D5EF5', '#FF5C8A', '#00B8A0', '#FF9F1C', '#3D9BFF', '#FF6B4A',
  '#9B5DE5', '#22C55E', '#F15BB5', '#06B6D4', '#D97706', '#7CB518',
];
const hueOf = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};
const HUES = Object.fromEntries(PALETTE.map((c) => [c, hueOf(c)]));
const hueGap = (a, b) => {
  const d = Math.abs(HUES[a] - HUES[b]) % 360;
  return Math.min(d, 360 - d);
};

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
  ev.votes ??= {};
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

/** Where the app lives, for links in calendar files and emails. */
const PUBLIC_URL = (
  process.env.PUBLIC_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
).replace(/\/+$/, '');
const publicUrl = (req) => PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
/**
 * The same, for links sent by email. There the address must not come from the request,
 * or a forged one could make a reset link point at someone else's site. Only a local
 * test server may use its own address.
 */
const mailLinkBase = (req) =>
  PUBLIC_URL || (['localhost', '127.0.0.1'].includes(req.hostname) ? publicUrl(req) : '');

/**
 * One session of a When as a calendar file. The name ends in .ics so the app's offline
 * layer leaves the request alone and the phone's calendar picks it up.
 */
app.get('/api/events/:id/when.ics', (req, res) => {
  const ev = store.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  const date = String(req.query.date ?? '');
  const start = Number(req.query.start);
  const end = Number(req.query.end);
  const valid =
    ev.dates.includes(date) && Number.isInteger(start) && Number.isInteger(end) &&
    start >= 0 && end > start && end <= 2880;
  if (!valid) return res.status(400).json({ error: 'bad_session' });
  const zone = cleanZone(ev.timeZone) ?? cleanZone(req.query.tz) ?? 'UTC';
  const [y, m, d] = date.split('-').map(Number);
  const at = (min) => new Date(Date.UTC(y, m - 1, d, 0, min) - zoneOffset(zone, date) * 60_000);
  const link = `${publicUrl(req)}/e/${ev.id}`;
  const description = [ev.description, say(cleanLang(String(req.query.lang ?? '')), 'planned_with', { url: link })]
    .filter(Boolean)
    .join('\n\n');
  res.setHeader('content-type', 'text/calendar; charset=utf-8');
  res.setHeader('content-disposition', 'inline; filename="when.ics"');
  res.setHeader('cache-control', 'no-store');
  res.send(
    calendarFile({
      uid: `${ev.id}-${date}-${start}@when`,
      title: ev.title,
      description,
      url: link,
      start: at(start),
      end: at(end),
    }),
  );
});

/**
 * The booked sessions of a When as a calendar to subscribe to. The installed app on
 * iPhone cannot show the "add event" sheet, but it can open the Calendar app on a
 * webcal address; the phone then keeps the sessions up to date by itself.
 */
app.get('/api/events/:id/booked.ics', (req, res) => {
  const ev = store.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  const zone = cleanZone(ev.timeZone) ?? cleanZone(req.query.tz) ?? 'UTC';
  const link = `${publicUrl(req)}/e/${ev.id}`;
  const description = [ev.description, say(cleanLang(String(req.query.lang ?? '')), 'planned_with', { url: link })]
    .filter(Boolean)
    .join('\n\n');
  const events = (ev.bookings ?? []).map((b) => {
    const [y, m, d] = b.date.split('-').map(Number);
    const at = (min) => new Date(Date.UTC(y, m - 1, d, 0, min) - zoneOffset(zone, b.date) * 60_000);
    return { uid: `${ev.id}-${b.date}@when`, title: ev.title, description, url: link, start: at(b.start), end: at(b.end) };
  });
  res.setHeader('content-type', 'text/calendar; charset=utf-8');
  res.setHeader('content-disposition', 'inline; filename="when-booked.ics"');
  res.setHeader('cache-control', 'no-store');
  res.send(calendarFeed({ name: `${ev.title} · When`, events }));
});

// ---- Signing in with Google
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';

/** What the app needs to know before it starts; empty client id means guests only. */
const mailer = createMailer();
console.log(
  !mailer.ready
    ? 'email: off (no mail service configured)'
    : PUBLIC_URL
      ? `email: ready, links point to ${PUBLIC_URL}`
      : 'email: configured, but PUBLIC_URL is not set, so only a local test server sends mail',
);

/** What the app needs to know before it starts; empty client id means no Google sign-in. */
const canMail = (req) => mailer.ready && !!mailLinkBase(req);
app.get('/api/config', (req, res) =>
  res.json({ googleClientId: GOOGLE_CLIENT_ID, mail: canMail(req), contact: process.env.CONTACT_EMAIL ?? '' }),
);

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

// ---- Accounts with an email and password
const loginTries = new Map(); // what was tried -> timestamps of recent failures
const TRY_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 8;

/** Slows down guessing: a handful of wrong passwords per address and per visitor, then a pause. */
function tooManyTries(keys) {
  const now = Date.now();
  return keys.some((key) => (loginTries.get(key) ?? []).filter((t) => now - t < TRY_WINDOW_MS).length >= MAX_TRIES);
}
function noteFailure(keys) {
  const now = Date.now();
  for (const key of keys) {
    loginTries.set(key, [...(loginTries.get(key) ?? []).filter((t) => now - t < TRY_WINDOW_MS), now]);
  }
}
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of loginTries) {
    if (!times.some((t) => now - t < TRY_WINDOW_MS)) loginTries.delete(key);
  }
}, TRY_WINDOW_MS).unref();

const cleanEmail = (v) => String(v ?? '').trim().toLowerCase().slice(0, 254);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** Emails the link that confirms an account's address. The link carries the token after a #, which browsers never send to servers. */
function sendVerification(req, acc, lang) {
  if (!canMail(req) || acc.verified) return;
  const url = `${mailLinkBase(req)}/verify#${accounts.startVerify(acc)}`;
  void mailer.send({
    to: acc.email,
    subject: say(lang, 'mail_verify_subject'),
    text: say(lang, 'mail_verify_body', { name: acc.name, url }),
  });
}

/** How often emails may be asked for: per address and per visitor. */
const mailAsks = new Map();
const MAIL_WINDOW_MS = 60 * 60 * 1000;
function mayAskForMail(keys, max = 4) {
  const now = Date.now();
  const recent = (key) => (mailAsks.get(key) ?? []).filter((t) => now - t < MAIL_WINDOW_MS);
  if (keys.some((key) => recent(key).length >= max)) return false;
  for (const key of keys) mailAsks.set(key, [...recent(key), now]);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of mailAsks) {
    if (!times.some((t) => now - t < MAIL_WINDOW_MS)) mailAsks.delete(key);
  }
}, MAIL_WINDOW_MS).unref();

const profile = (acc, session) => ({
  name: acc.name,
  email: acc.email,
  // Google has already checked the address of its own accounts.
  verified: acc.password ? acc.verified === true : true,
  ...(session ? { session } : {}),
});

app.post('/api/auth/register', async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const username = cleanName(req.body?.username);
  const password = String(req.body?.password ?? '');
  if (!isEmail(email)) return res.status(400).json({ error: 'bad_email' });
  if (username.length < 2) return res.status(400).json({ error: 'bad_username' });
  if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'bad_password' });
  const made = await accounts.register({ email, username, password });
  if (made.error) return res.status(409).json({ error: made.error });
  sendVerification(req, made.account, cleanLang(String(req.body?.lang ?? '')));
  res.status(201).json(profile(made.account, made.session));
});

app.post('/api/auth/login', async (req, res) => {
  const login = cleanEmail(req.body?.login);
  const password = String(req.body?.password ?? '').slice(0, 200);
  const keys = [`who:${login}`, `ip:${req.ip}`];
  if (tooManyTries(keys)) return res.status(429).json({ error: 'too_many_tries' });
  const found = login && password ? await accounts.logIn(login, password) : null;
  if (!found) {
    noteFailure(keys);
    return res.status(401).json({ error: 'wrong_login' });
  }
  res.json(profile(found.account, found.session));
});

/** Who this device is signed in as, e.g. to learn that the email was confirmed elsewhere. */
app.get('/api/me', (req, res) => {
  const me = account(req);
  if (!me) return res.status(401).json({ error: 'signed_out' });
  res.json(profile(me));
});

/**
 * Deletes the account: its sign-ins, its list of Whens and its calendar links. The Whens
 * themselves stay as they are for everyone in them.
 */
app.delete('/api/me', (req, res) => {
  const me = account(req);
  if (!me) return res.status(401).json({ error: 'signed_out' });
  accounts.remove(me);
  res.status(204).end();
});

/** Sends the confirmation email again. */
app.post('/api/auth/verify/send', (req, res) => {
  const me = account(req);
  if (!me) return res.status(401).json({ error: 'signed_out' });
  if (!canMail(req)) return res.status(503).json({ error: 'no_mail' });
  if (!mayAskForMail([`verify:${me.id}`])) return res.status(429).json({ error: 'too_many_tries' });
  sendVerification(req, me, cleanLang(String(req.body?.lang ?? '')));
  res.status(204).end();
});

/** The link from the confirmation email was opened. */
app.post('/api/auth/verify', (req, res) => {
  if (tooManyTries([`token:${req.ip}`])) return res.status(429).json({ error: 'too_many_tries' });
  const acc = accounts.verify(req.body?.token);
  if (!acc) {
    noteFailure([`token:${req.ip}`]);
    return res.status(400).json({ error: 'bad_link' });
  }
  res.json({ email: acc.email });
});

/**
 * "Forgot password": emails a link for setting a new one. Always answers the same way,
 * so nobody can use it to find out which addresses have an account.
 */
app.post('/api/auth/forgot', (req, res) => {
  if (!canMail(req)) return res.status(503).json({ error: 'no_mail' });
  const email = cleanEmail(req.body?.email);
  if (!isEmail(email)) return res.status(400).json({ error: 'bad_email' });
  if (!mayAskForMail([`ip:${req.ip}`], 8)) return res.status(429).json({ error: 'too_many_tries' });
  res.status(204).end();
  if (!mayAskForMail([`reset:${email}`], 3)) return;
  const started = accounts.startReset(email);
  if (!started) return;
  const lang = cleanLang(String(req.body?.lang ?? ''));
  const url = `${mailLinkBase(req)}/reset#${started.token}`;
  void mailer.send({
    to: started.account.email,
    subject: say(lang, 'mail_reset_subject'),
    text: say(lang, 'mail_reset_body', { name: started.account.name, url }),
  });
});

/** The link from the reset email was opened and a new password chosen. */
app.post('/api/auth/reset', async (req, res) => {
  const password = String(req.body?.password ?? '');
  if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'bad_password' });
  if (tooManyTries([`token:${req.ip}`])) return res.status(429).json({ error: 'too_many_tries' });
  const done = await accounts.reset(req.body?.token, password);
  if (!done) {
    noteFailure([`token:${req.ip}`]);
    return res.status(400).json({ error: 'bad_link' });
  }
  res.json(profile(done.account, done.session));
});

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

/** The calendar links someone added, kept with their account so every device shows them. */
app.get('/api/me/calendars', (req, res) => {
  const me = account(req);
  if (!me) return res.status(401).json({ error: 'signed_out' });
  res.json({ links: me.calendars ?? [] });
});

app.put('/api/me/calendars', (req, res) => {
  const me = account(req);
  if (!me) return res.status(401).json({ error: 'signed_out' });
  const given = Array.isArray(req.body?.links) ? req.body.links : null;
  if (!given) return res.status(400).json({ error: 'bad_links' });
  const links = [...new Set(given)]
    .filter((l) => typeof l === 'string' && l.length <= 600 && /^https:\/\/[^\s/]+\/\S+$/.test(l))
    .slice(0, 5);
  accounts.setCalendars(me, links);
  res.json({ links });
});

// ---- Who a browser is in each When, kept in a cookie the server sets. Browsers throw away
// script-written storage sooner than server cookies, so guests do not lose their place.
const ME_COOKIE = 'when_me';
const MAX_REMEMBERED = 40;

function readMeCookie(req) {
  const raw = (req.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ME_COOKIE}=`));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(Buffer.from(raw.slice(ME_COOKIE.length + 1), 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMeCookie(req, res, map) {
  const value = Buffer.from(JSON.stringify(map)).toString('base64url');
  const secure = req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : '';
  res.setHeader('set-cookie', `${ME_COOKIE}=${value}; Path=/; Max-Age=34560000; HttpOnly; SameSite=Lax${secure}`);
}

app.get('/api/identity/:id', (req, res) => {
  const pid = readMeCookie(req)[req.params.id];
  const ev = store.get(req.params.id);
  const p = pid && ev ? ev.participants.find((x) => x.id === pid) : null;
  res.json(p ? { participantId: p.id, name: p.name } : {});
});

app.post('/api/identity', (req, res) => {
  const ev = store.get(String(req.body?.eventId ?? ''));
  const p = ev?.participants.find((x) => x.id === req.body?.participantId);
  if (!ev || !p) return res.status(404).json({ error: 'not_found' });
  const map = readMeCookie(req);
  delete map[ev.id];
  const entries = [...Object.entries(map), [ev.id, p.id]].slice(-MAX_REMEMBERED);
  writeMeCookie(req, res, Object.fromEntries(entries));
  res.status(204).end();
});

/**
 * Reads a calendar subscription link (Apple, Outlook, …) for someone signed in and
 * returns its events in a range. The events themselves are never stored.
 */
app.post('/api/calendar/link', async (req, res) => {
  if (!account(req)) return res.status(401).json({ error: 'signed_out' });
  const from = new Date(String(req.body?.from ?? ''));
  const to = new Date(String(req.body?.to ?? ''));
  const span = to.getTime() - from.getTime();
  if (!(span > 0) || span > 120 * DAY_MS) return res.status(400).json({ error: 'bad_range' });
  try {
    const text = await fetchCalendar(req.body?.url);
    const events = eventsBetween(text, from, to);
    res.json({ events, total: events.total });
  } catch (err) {
    const code = err?.code ?? (err?.name === 'TimeoutError' ? 'unreachable' : 'unreadable');
    res.status(code === 'bad_url' ? 400 : 502).json({ error: code });
  }
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

/**
 * A colour for a new participant: one not in use, and as far in hue from the colours
 * already in the When as possible, so two people never get look-alike shades. Among the
 * best few the choice is random, so Whens do not all look the same.
 */
function pickColor(ev) {
  const used = ev.participants.map((p) => p.color).filter((c) => c in HUES);
  const free = PALETTE.filter((c) => !used.includes(c));
  const pool = free.length ? free : PALETTE;
  if (!used.length) return pool[Math.floor(Math.random() * pool.length)];
  const ranked = pool
    .map((c) => ({ c, gap: Math.min(...used.map((u) => hueGap(c, u))) }))
    .sort((a, b) => b.gap - a.gap);
  const best = ranked.filter((r) => r.gap >= ranked[0].gap - 10);
  return best[Math.floor(Math.random() * best.length)].c;
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
          const same = ev.participants.find((x) => x.name.toLowerCase() === name.toLowerCase());
          if (same) {
            // Someone of that name is here already. If they are not connected right now and the
            // newcomer says "that's me" (a lost browser storage, a new phone), carry on as them.
            const online = onlineIds(ev.id).includes(same.id);
            if (msg.reclaim === true && !online) p = same;
            else { send(ws, { type: 'nameTaken', name, online }); return; }
          }
        }
        if (!p) {
          const name = cleanName(msg.name);
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
      case 'vote': {
        // A vote for a possible session, keyed by its date and minutes; 0 takes it back.
        const p = ev.participants.find((x) => x.id === ws.participantId);
        const key = String(msg.key ?? '');
        const value = [1, 0].includes(msg.value) ? msg.value : null;
        if (!p || value === null || !/^\d{4}-\d{2}-\d{2}:\d{1,4}:\d{1,4}$/.test(key)) return;
        ev.votes ??= {};
        if (value === 0) {
          delete ev.votes[key]?.[p.id];
          if (ev.votes[key] && !Object.keys(ev.votes[key]).length) delete ev.votes[key];
        } else {
          if (!ev.votes[key] && Object.keys(ev.votes).length >= 200) return;
          (ev.votes[key] ??= {})[p.id] = value;
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

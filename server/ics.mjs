import ical from 'node-ical';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 8000;

/**
 * Reads a calendar from a subscription link (the kind Apple Calendar, Outlook and
 * others give out) and returns its events between two moments.
 *
 * The link is fetched by the server because calendar hosts don't allow browsers to.
 * To keep that from being used to reach anything else, only public https addresses
 * are fetched: no private networks, no other ports, no credentials.
 */
export async function fetchCalendar(rawUrl) {
  let url = parse(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url.hostname);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = parse(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    if (!res.ok) throw problem('unreachable', `the calendar answered ${res.status}`);
    const text = await limited(res);
    if (!/BEGIN:VCALENDAR/i.test(text)) throw problem('not_a_calendar', 'that link is not a calendar');
    return text;
  }
  throw problem('unreachable', 'too many redirects');
}

function parse(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim().replace(/^webcals?:/i, 'https:'));
  } catch {
    throw problem('bad_url', 'that is not a link');
  }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) {
    throw problem('bad_url', 'only https calendar links are accepted');
  }
  return url;
}

async function assertPublic(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw problem('unreachable', 'the calendar could not be found');
  if (addresses.some((a) => isPrivate(a.address))) throw problem('bad_url', 'that address is not allowed');
}

function isPrivate(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivate(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') ||
    v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}

async function limited(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw problem('too_big', 'that calendar is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function problem(code, message) {
  return Object.assign(new Error(message), { code });
}

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Events that touch [from, to), with repeating events expanded (exceptions and moved
 * occurrences included). Timed events come back as absolute moments; all-day ones as
 * calendar days, where `endDate` is the day after the last day, as calendars write it.
 */
export function eventsBetween(text, from, to) {
  const out = [];
  const data = ical.sync.parseICS(text);
  // How many events the calendar holds at all, so "none on these days" can be told from "empty".
  out.total = Object.values(data).filter((e) => e.type === 'VEVENT').length;
  for (const event of Object.values(data)) {
    if (event.type !== 'VEVENT' || !event.start || event.status === 'CANCELLED') continue;
    let occurrences;
    try {
      occurrences = ical.expandRecurringEvent(event, { from, to });
    } catch {
      continue; // one malformed event shouldn't lose the calendar
    }
    for (const o of occurrences) {
      const start = o.start;
      const end = o.end ?? o.start;
      const summary = String(o.summary?.val ?? o.summary ?? '').slice(0, 120);
      if (o.isFullDay) {
        // A one-day all-day event may come without an end.
        const last = end > start ? end : new Date(start.getTime() + 24 * 3600_000);
        out.push({ summary, startDate: dayKey(start), endDate: dayKey(last) });
      } else if (end > from && start < to) {
        out.push({ summary, start: start.toISOString(), end: end.toISOString() });
      }
      if (out.length >= 1000) return out;
    }
  }
  return out;
}

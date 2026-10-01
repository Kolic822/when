const pad = (n) => String(n).padStart(2, '0');

function stamp(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escapes text for an iCalendar property value. */
const escapeText = (s) =>
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/** Folds long lines as RFC 5545 requires (75 bytes at most, never inside a character). */
function fold(line) {
  const out = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > 74) {
      out.push(current);
      current = ' ';
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

/**
 * A calendar file with one event, for "Add to calendar". Phones only offer to add an
 * event when the file comes from a real address, so the server makes it, not the app.
 */
export function calendarFile({ uid, title, description, url, start, end }) {
  return calendarFeed({ events: [{ uid, title, description, url, start, end }] });
}

/**
 * A calendar with several events. Given a `name` it can be subscribed to (the installed
 * app on iPhone can only hand a calendar to the phone that way), and the phone checks
 * back for changes now and then.
 */
export function calendarFeed({ name, events }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//When//Meetup//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...(name
      ? [
          `X-WR-CALNAME:${escapeText(name)}`,
          'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
          'X-PUBLISHED-TTL:PT1H',
        ]
      : []),
  ];
  for (const { uid, title, description, url, start, end } of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(title)}`,
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      ...(url ? [`URL:${url}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

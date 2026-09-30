import { lang } from './i18n/i18n';
import { viewerZone } from './zone';

const isApple = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/**
 * Hands one session to the device's calendar. The server makes the calendar file, since
 * phones only offer "Add to Calendar" for a file that comes from a real address.
 */
export function openInCalendar(
  eventId: string,
  session: { date: string; start: number; end: number },
): void {
  const query = new URLSearchParams({
    date: session.date,
    start: String(session.start),
    end: String(session.end),
    lang: lang(),
    tz: viewerZone(),
  });
  const url = `/api/events/${encodeURIComponent(eventId)}/when.ics?${query}`;
  if (isApple()) {
    // The installed app has no way to show the sheet itself; a browser view on top does.
    if (isInstalled() && window.open(url, '_blank')) return;
    window.location.href = url;
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = 'when.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

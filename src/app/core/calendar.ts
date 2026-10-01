import { lang } from './i18n/i18n';
import { viewerZone } from './zone';

const isApple = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/**
 * Hands a booked session to the device's calendar. The server makes the calendar file,
 * since phones only offer "Add to Calendar" for a file that comes from a real address.
 *
 * The installed app on iPhone cannot show that sheet at all, so there the Calendar app is
 * opened on a webcal address instead and subscribes to the When's booked sessions: they
 * appear at once and follow later changes by themselves.
 */
export function openInCalendar(
  eventId: string,
  session: { date: string; start: number; end: number },
): void {
  const common = { lang: lang(), tz: viewerZone() };
  const id = encodeURIComponent(eventId);
  if (isApple() && isInstalled()) {
    const query = new URLSearchParams(common);
    window.location.href = `webcal://${location.host}/api/events/${id}/booked.ics?${query}`;
    return;
  }
  const query = new URLSearchParams({
    date: session.date,
    start: String(session.start),
    end: String(session.end),
    ...common,
  });
  const url = `/api/events/${id}/when.ics?${query}`;
  if (isApple()) {
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

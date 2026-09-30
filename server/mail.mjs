/**
 * Sends the two emails accounts need: "confirm your address" and "set a new password".
 * Goes through a mail service's web API (the host blocks plain SMTP): Resend when
 * RESEND_API_KEY is set, Brevo when BREVO_API_KEY is set. MAIL_FROM says who it is from,
 * e.g. `When <hello@example.com>`. With neither key nothing is sent and `ready` is false,
 * so the app hides what depends on email. MAIL_LOG=1 prints mails instead (for testing).
 */
export function createMailer(env = process.env) {
  const from = parseFrom(env.MAIL_FROM ?? '');
  const resend = env.RESEND_API_KEY ?? '';
  const brevo = env.BREVO_API_KEY ?? '';
  const log = env.MAIL_LOG === '1';
  const ready = log || (!!from && !!(resend || brevo));

  async function send({ to, subject, text }) {
    if (!ready) return false;
    if (log) {
      console.log(`--- mail to ${to}: ${subject}\n${text}\n---`);
      return true;
    }
    const html = toHtml(text);
    const request = resend
      ? fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${resend}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [to], subject, text, html }),
          signal: AbortSignal.timeout(10_000),
        })
      : fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevo, 'content-type': 'application/json' },
          body: JSON.stringify({ sender: from, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
          signal: AbortSignal.timeout(10_000),
        });
    try {
      const res = await request;
      if (!res.ok) console.error(`mail not sent (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return res.ok;
    } catch (err) {
      console.error('mail not sent:', err?.message ?? err);
      return false;
    }
  }

  return { ready, send };
}

/** "When <hello@example.com>" or just an address. */
function parseFrom(value) {
  const named = /^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(value);
  if (named) return { name: named[1] || 'When', email: named[2] };
  return /^\S+@\S+$/.test(value.trim()) ? { name: 'When', email: value.trim() } : null;
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The plain text as simple HTML, with links made tappable. */
function toHtml(text) {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, '<br>');
  return `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">${body}</div>`;
}

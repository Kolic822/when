import webpush from 'web-push';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Web Push: notifications that reach people while the app is closed.
 * The key pair identifies this server to the browsers' push services. It comes from
 * the environment, or is created once and kept next to the data file.
 */
export function createPush(dataFile) {
  const keys = loadKeys(dataFile);
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:kolicteo@gmail.com',
    keys.publicKey,
    keys.privateKey,
  );

  return {
    publicKey: keys.publicKey,

    /**
     * Sends one notification to a list of stored subscriptions.
     * Returns the endpoints that no longer exist, so the caller can forget them.
     */
    async send(subscriptions, { title, body, url }) {
      const payload = JSON.stringify({
        // The shape Angular's service worker shows as a notification and opens on tap.
        notification: {
          title,
          body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url } } },
        },
      });
      const gone = [];
      await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24 });
          } catch (err) {
            if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(sub.endpoint);
            else console.warn('push failed:', err?.statusCode ?? err?.message ?? err);
          }
        }),
      );
      return gone;
    },
  };
}

function loadKeys(dataFile) {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = process.env;
  if (publicKey && privateKey) return { publicKey, privateKey };
  const file = path.join(path.dirname(dataFile), 'vapid.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const keys = webpush.generateVAPIDKeys();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  console.log(`created push keys in ${path.basename(file)}`);
  return keys;
}

/** A browser's push subscription, reduced to what is needed to send to it. */
export function cleanSubscription(raw) {
  const endpoint = typeof raw?.endpoint === 'string' ? raw.endpoint : '';
  const p256dh = raw?.keys?.p256dh;
  const auth = raw?.keys?.auth;
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) return null;
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, keys: { p256dh, auth } };
}

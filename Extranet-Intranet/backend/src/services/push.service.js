import webpush from 'web-push'
import { query } from '../config/database.js'

/**
 * Phone and desktop alerts (Web Push, VAPID). Every in-app notification is also pushed to the
 * person's subscribed devices, so alerts arrive while the app is closed.
 *
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: contact).
 * Generate the keys once with: npx web-push generate-vapid-keys
 * PUSH_HIDE_DETAILS=true shows only the title on lock screens (never the notification text).
 */

/**
 * Subscriptions must point at a real browser push service, never an arbitrary URL:
 * the server makes the request, so an open endpoint would let anyone make it call internal hosts.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
]

const MAX_DEVICES = 10
const MAX_FAILURES = 5

let sender = (subscription, payload, options) => webpush.sendNotification(subscription, payload, options)
/** Tests replace the network call. */
export function setPushSender(fn) {
  sender = fn || ((subscription, payload, options) => webpush.sendNotification(subscription, payload, options))
}

export function pushConfigured() {
  const subject = String(process.env.VAPID_SUBJECT || '').trim()
  return Boolean(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim() && /^(mailto:|https:\/\/)/.test(subject))
}

export const publicKey = () => (pushConfigured() ? process.env.VAPID_PUBLIC_KEY.trim() : null)

export function validEndpoint(endpoint) {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((host) => host.test(url.hostname))
  } catch {
    return false
  }
}

export async function saveSubscription(userId, { endpoint, keys }, device) {
  const { rows } = await query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, device)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       device = EXCLUDED.device, failures = 0
     RETURNING id`,
    [userId, endpoint, keys.p256dh, keys.auth, device],
  )
  // Keep the newest devices only.
  await query(
    `DELETE FROM push_subscriptions WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${MAX_DEVICES})`,
    [userId],
  )
  return rows[0].id
}

/** Sends one alert per notification row to each of the person's devices. Never throws. */
export async function pushNotifications(rows) {
  if (!pushConfigured() || !rows?.length) return 0
  const hide = String(process.env.PUSH_HIDE_DETAILS || '').trim().toLowerCase() === 'true'
  let sent = 0
  try {
    const { rows: subscriptions } = await query(
      'SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::int[])',
      [[...new Set(rows.map((row) => row.user_id))]],
    )
    const options = {
      TTL: 24 * 3600,
      urgency: 'normal',
      vapidDetails: { subject: process.env.VAPID_SUBJECT.trim(), publicKey: process.env.VAPID_PUBLIC_KEY.trim(), privateKey: process.env.VAPID_PRIVATE_KEY.trim() },
    }
    await Promise.all(subscriptions.map(async (sub) => {
      for (const row of rows.filter((item) => item.user_id === sub.user_id)) {
        const payload = JSON.stringify({
          id: row.id,
          type: row.type,
          title: row.title,
          body: hide ? null : row.body,
          link: row.link && String(row.link).startsWith('/') ? row.link : null,
        })
        try {
          await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, options)
          sent += 1
          await query('UPDATE push_subscriptions SET last_sent_at = now(), failures = 0 WHERE id = $1', [sub.id])
        } catch (error) {
          // 404/410: the browser dropped the subscription (app uninstalled, permission revoked).
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id])
            return
          }
          await query('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = $1', [sub.id])
          await query('DELETE FROM push_subscriptions WHERE id = $1 AND failures >= $2', [sub.id, MAX_FAILURES])
        }
      }
    }))
  } catch {
    // Alerts are best effort; the in-app notification already exists.
  }
  return sent
}

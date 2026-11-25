import { z } from 'zod'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { notify } from '../services/notification.service.js'
import { publicKey, pushConfigured, saveSubscription, validEndpoint } from '../services/push.service.js'

const fail = (res, status, message) => res.status(status).json({ message })

const base64url = z.string().regex(/^[A-Za-z0-9_-]+=*$/)
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: base64url.min(40).max(200), auth: base64url.min(8).max(64) }),
})

/** GET /api/push — whether alerts are available and the key the browser subscribes with. */
export async function pushConfig(req, res) {
  const { rows } = await query('SELECT COUNT(*)::int AS devices FROM push_subscriptions WHERE user_id = $1', [req.user.sub])
  return res.json({ data: { enabled: pushConfigured(), public_key: publicKey(), devices: rows[0].devices } })
}

/** POST /api/push/subscriptions — this device wants alerts. */
export async function subscribe(req, res) {
  if (!pushConfigured()) return fail(res, 503, 'Phone alerts are not set up yet.')
  const parsed = subscriptionSchema.safeParse(req.body?.subscription || req.body || {})
  if (!parsed.success || !validEndpoint(parsed.data.endpoint)) return fail(res, 400, 'This browser sent an invalid alert subscription.')
  const device = String(req.get('user-agent') || '').slice(0, 200) || null
  const id = await saveSubscription(req.user.sub, parsed.data, device)
  await writeAudit(req.user.sub, 'PUSH_SUBSCRIBED', 'push_subscriptions', id)
  return res.status(201).json({ message: 'Alerts are on for this device.' })
}

/** DELETE /api/push/subscriptions — this device (endpoint) or, without one, all my devices. */
export async function unsubscribe(req, res) {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : null
  const { rowCount } = endpoint
    ? await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user.sub, endpoint])
    : await query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.user.sub])
  await writeAudit(req.user.sub, 'PUSH_UNSUBSCRIBED', 'push_subscriptions', null, { devices: rowCount })
  return res.json({ message: 'Alerts are off for this device.' })
}

/** POST /api/push/test — sends a test alert to all my devices. */
export async function testPush(req, res) {
  if (!pushConfigured()) return fail(res, 503, 'Phone alerts are not set up yet.')
  await notify([req.user.sub], { type: 'test', title: 'Test alert', body: 'Alerts are working on this device.', link: null })
  return res.json({ message: 'Test alert sent.' })
}

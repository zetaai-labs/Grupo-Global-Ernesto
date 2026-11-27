import { z } from 'zod'
import { config } from '../config/env.js'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { USER_FIELDS, publicUser } from './auth.controller.js'

/**
 * Privacy and data-protection acceptance (GDPR art. 7 / LOPDGDD): nobody uses the platform before accepting
 * the current policy version, every acceptance and withdrawal is kept as evidence, and withdrawing ends
 * every session until the person accepts again.
 */

const LANGUAGE = z.string().trim().max(8).regex(/^[a-z]{2}(-[A-Za-z]{2})?$/).optional()

/** Who, which version, when and from where: the evidence a supervisory authority asks for. */
export async function recordConsent(client, { userId = null, applicationId = null, action, language, req }) {
  await (client || { query }).query(
    `INSERT INTO privacy_consents (user_id, application_id, policy_version, action, language, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, applicationId, config.privacy.version, action, language || null,
      String(req?.ip || '').slice(0, 64) || null, String(req?.headers?.['user-agent'] || '').slice(0, 255) || null],
  )
}

/** Public: the current policy version and where its texts are published (the built-in pages when no URL is set). */
export function legalInfo(_req, res) {
  const { version, enforce, privacyUrl, termsUrl, cookiesUrl } = config.privacy
  return res.json({
    data: {
      version,
      required: enforce,
      contact: process.env.PRIVACY_CONTACT_EMAIL || process.env.SUPPORT_EMAIL || 'support@grupoglobal.es',
      documents: {
        privacy: privacyUrl || '/legal/privacy',
        terms: termsUrl || '/legal/terms',
        cookies: cookiesUrl || '/legal/cookies',
      },
      // The platform sets only what it needs to work; there are no analytics or advertising cookies.
      cookies: [
        { name: 'Session and security', purpose: 'Keeps you signed in and protects sign-in.', essential: true },
        { name: 'Preferences', purpose: 'Remembers your language and light or dark theme.', essential: true },
        { name: 'Offline app', purpose: 'Lets the installed app open quickly and work without connection.', essential: true },
      ],
    },
  })
}

export async function acceptPrivacy(req, res) {
  const parsed = z.object({ accept: z.literal(true), language: LANGUAGE }).safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ message: 'Tick the box to accept the privacy policy.' })
  await query('UPDATE users SET privacy_version = $2, privacy_accepted_at = now() WHERE id = $1', [req.user.sub, config.privacy.version])
  await recordConsent(null, { userId: req.user.sub, action: 'ACCEPTED', language: parsed.data.language, req })
  await writeAudit(req.user.sub, 'PRIVACY_ACCEPTED', 'users', String(req.user.sub), { version: config.privacy.version })
  const { rows } = await query(`${USER_FIELDS} WHERE u.id = $1`, [req.user.sub])
  return res.json({ message: 'Thank you. Your acceptance has been recorded.', data: publicUser(rows[0]) })
}

/** Withdrawing ends every session: the person can sign in again only to accept, read or export their data. */
export async function withdrawPrivacy(req, res) {
  await query(
    'UPDATE users SET privacy_version = NULL, privacy_accepted_at = NULL, session_version = session_version + 1 WHERE id = $1',
    [req.user.sub],
  )
  await recordConsent(null, { userId: req.user.sub, action: 'WITHDRAWN', language: LANGUAGE.safeParse(req.body?.language).data, req })
  await writeAudit(req.user.sub, 'PRIVACY_WITHDRAWN', 'users', String(req.user.sub), { version: config.privacy.version })
  return res.json({ message: 'Your consent has been withdrawn and you have been signed out.' })
}

/** The person's own acceptance history (also part of the GDPR data export). */
export async function consentHistory(userId) {
  const { rows } = await query(
    'SELECT policy_version, action, language, created_at FROM privacy_consents WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  )
  return rows
}

export async function myConsents(req, res) {
  return res.json({ data: await consentHistory(req.user.sub) })
}

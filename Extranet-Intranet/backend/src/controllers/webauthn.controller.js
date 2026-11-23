import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { config } from '../config/env.js'
import { MFA_REQUIRED_ROLES } from '../config/roles.js'
import { audit, publicUser, signToken, USER_FIELDS } from './auth.controller.js'

/** WebAuthn / FIDO2 security keys (Technical Spec §3.1). */

const MAX_KEYS = 10
const fail = (res, status, message) => res.status(status).json({ message })
const uuid = z.string().uuid()
const attestation = z.object({ id: z.string().min(1).max(1024), rawId: z.string().min(1).max(1024), type: z.literal('public-key') }).passthrough()

function relyingParty() {
  const origins = config.frontendOrigin.split(',').map((origin) => origin.trim()).filter(Boolean)
  return { origins, rpID: config.security.webauthnRpId || new URL(origins[0]).hostname, rpName: config.security.webauthnRpName }
}

const saveChallenge = (userId, purpose, challenge) => query(
  `INSERT INTO webauthn_challenges (user_id, purpose, challenge, expires_at)
   VALUES ($1, $2, $3, now() + interval '5 minutes')
   ON CONFLICT (user_id, purpose) DO UPDATE SET challenge = EXCLUDED.challenge, expires_at = EXCLUDED.expires_at, created_at = now()`,
  [userId, purpose, challenge],
)

/** Challenges are single use: reading one removes it. */
async function takeChallenge(userId, purpose) {
  const { rows } = await query(
    'DELETE FROM webauthn_challenges WHERE user_id = $1 AND purpose = $2 AND expires_at > now() RETURNING challenge',
    [userId, purpose],
  )
  return rows[0]?.challenge || null
}

/** Changing sign-in methods needs the password, so a stolen session cannot add its own key. */
async function passwordMatches(userId, password) {
  if (typeof password !== 'string' || !password) return false
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId])
  return Boolean(rows[0]) && bcrypt.compare(password, rows[0].password_hash)
}

const credentialsFor = (userId) => query(
  'SELECT * FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at',
  [userId],
)

// ----- Managing keys (signed-in user) -----

export async function listKeys(req, res) {
  const [keys, user] = await Promise.all([
    query('SELECT webauthn_id, name, last_used_at, created_at FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at', [req.user.sub]),
    query('SELECT mfa_enabled, mfa_secret IS NOT NULL AS has_secret FROM users WHERE id = $1', [req.user.sub]),
  ])
  return res.json({
    data: {
      credentials: keys.rows,
      mfa_enabled: user.rows[0].mfa_enabled,
      totp_enabled: user.rows[0].mfa_enabled && user.rows[0].has_secret,
    },
  })
}

export async function registerOptions(req, res) {
  if (!(await passwordMatches(req.user.sub, req.body?.password))) return fail(res, 401, 'Your password is not correct.')
  const existing = await credentialsFor(req.user.sub)
  if (existing.rowCount >= MAX_KEYS) return fail(res, 409, `You can register up to ${MAX_KEYS} security keys.`)
  const { rpID, rpName } = relyingParty()
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: req.user.email,
    userDisplayName: req.user.name,
    userID: new TextEncoder().encode(req.user.uuid),
    attestationType: 'none',
    excludeCredentials: existing.rows.map((key) => ({ id: key.credential_id, transports: key.transports })),
    authenticatorSelection: { residentKey: 'discouraged', userVerification: 'preferred' },
  })
  await saveChallenge(req.user.sub, 'register', options.challenge)
  return res.json({ data: options })
}

export async function registerVerify(req, res) {
  const parsed = attestation.safeParse(req.body?.response)
  if (!parsed.success) return fail(res, 400, 'Invalid security key response.')
  const name = String(req.body?.name || '').trim().slice(0, 100) || 'Security key'
  const expectedChallenge = await takeChallenge(req.user.sub, 'register')
  if (!expectedChallenge) return fail(res, 400, 'This request expired. Please try again.')

  const { origins, rpID } = relyingParty()
  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: req.body.response, expectedChallenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: false,
    })
  } catch {
    return fail(res, 400, 'The security key could not be verified.')
  }
  if (!verification.verified) return fail(res, 400, 'The security key could not be verified.')

  const { credential } = verification.registrationInfo
  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports, name)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.user.sub, credential.id, Buffer.from(credential.publicKey), credential.counter, credential.transports || [], name],
      )
      // An authenticator secret that was never confirmed must not become a working factor.
      await client.query(
        'UPDATE users SET mfa_secret = CASE WHEN mfa_enabled THEN mfa_secret ELSE NULL END, mfa_enabled = true WHERE id = $1',
        [req.user.sub],
      )
    })
  } catch (error) {
    if (error.code === '23505') return fail(res, 409, 'This security key is already registered.')
    throw error
  }
  await audit(req.user.sub, 'MFA_WEBAUTHN_ADDED', { name })
  // A session limited to MFA setup becomes a full session.
  const { rows } = await query(`${USER_FIELDS} WHERE u.id = $1`, [req.user.sub])
  return res.status(201).json({ message: 'Security key added.', data: { token: signToken(rows[0]), user: publicUser(rows[0]) } })
}

export async function removeKey(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid security key.')
  if (!(await passwordMatches(req.user.sub, req.body?.password))) return fail(res, 401, 'Your password is not correct.')
  const result = await withTransaction(async (client) => {
    const user = await client.query('SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1 FOR UPDATE', [req.user.sub])
    const keys = await client.query('SELECT webauthn_id FROM webauthn_credentials WHERE user_id = $1', [req.user.sub])
    if (!keys.rows.some((key) => key.webauthn_id === req.params.id)) return { status: 404, message: 'Security key not found.' }
    const hasTotp = user.rows[0].mfa_enabled && Boolean(user.rows[0].mfa_secret)
    const isLastFactor = keys.rowCount === 1 && !hasTotp
    if (isLastFactor && config.security.enforceMfa && MFA_REQUIRED_ROLES.includes(req.user.role)) {
      return { status: 409, message: 'MFA is mandatory for your role. Add another method before removing this key.' }
    }
    await client.query('DELETE FROM webauthn_credentials WHERE webauthn_id = $1', [req.params.id])
    if (isLastFactor) await client.query('UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1', [req.user.sub])
    return {}
  })
  if (result.status) return fail(res, result.status, result.message)
  await audit(req.user.sub, 'MFA_WEBAUTHN_REMOVED')
  return res.json({ message: 'Security key removed.' })
}

// ----- Signing in (second factor) -----

async function mfaUser(token) {
  let claims
  try {
    claims = jwt.verify(token, config.jwtSecret)
  } catch {
    return null
  }
  if (claims.purpose !== 'mfa') return null
  const { rows } = await query(`${USER_FIELDS} WHERE u.id = $1 AND u.status = 'active' AND u.mfa_enabled = true`, [claims.sub])
  return rows[0] || null
}

export async function loginOptions(req, res) {
  const user = await mfaUser(req.body?.mfa_token)
  if (!user) return fail(res, 401, 'Invalid or expired MFA token.')
  const keys = await credentialsFor(user.id)
  if (!keys.rowCount) return fail(res, 400, 'No security key is registered for this account.')
  const options = await generateAuthenticationOptions({
    rpID: relyingParty().rpID,
    allowCredentials: keys.rows.map((key) => ({ id: key.credential_id, transports: key.transports })),
    userVerification: 'preferred',
  })
  await saveChallenge(user.id, 'login', options.challenge)
  return res.json({ data: options })
}

export async function loginVerify(req, res) {
  const user = await mfaUser(req.body?.mfa_token)
  if (!user) return fail(res, 401, 'Invalid or expired MFA token.')
  const parsed = attestation.safeParse(req.body?.response)
  const denied = async () => {
    await audit(user.id, 'MFA_WEBAUTHN_FAILED')
    return fail(res, 401, 'The security key could not be verified.')
  }
  if (!parsed.success) return denied()

  const expectedChallenge = await takeChallenge(user.id, 'login')
  if (!expectedChallenge) return fail(res, 401, 'This sign-in expired. Please try again.')
  const { rows } = await query('SELECT * FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2', [user.id, parsed.data.id])
  const key = rows[0]
  if (!key) return denied()

  const { origins, rpID } = relyingParty()
  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: { id: key.credential_id, publicKey: new Uint8Array(key.public_key), counter: Number(key.counter), transports: key.transports },
    })
  } catch {
    return denied()
  }
  if (!verification.verified) return denied()

  // The counter guards against cloned keys, including two sign-ins racing each other.
  const updated = await query(
    'UPDATE webauthn_credentials SET counter = $2, last_used_at = now() WHERE webauthn_id = $1 AND counter = $3',
    [key.webauthn_id, verification.authenticationInfo.newCounter, key.counter],
  )
  if (!updated.rowCount) return denied()

  await audit(user.id, 'MFA_WEBAUTHN_LOGIN')
  return res.json({ data: { token: signToken(user, { region: user.region }), user: publicUser(user) } })
}

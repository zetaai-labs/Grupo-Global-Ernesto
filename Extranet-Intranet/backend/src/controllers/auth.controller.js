import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { config } from '../config/env.js'
import { query } from '../config/database.js'
import { generateSecret, otpauthUrl, verifyCode } from '../services/totp.js'
import { sendMail, smtpConfigured } from '../services/email.service.js'
import { MFA_REQUIRED_ROLES, roleCode } from '../config/roles.js'
import { consentRequired } from '../services/consentRule.js'

export const USER_FIELDS = `
  SELECT u.id, u.uuid, u.name, u.email, u.password_hash, u.mfa_secret, u.mfa_enabled, u.org_id, u.session_version, u.avatar_updated_at,
         u.privacy_version, u.privacy_accepted_at,
         r.name AS role, r.code AS role_code, rg.code AS region, o.legal_name AS organization
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN regions rg ON rg.id = u.region_id
  LEFT JOIN organizations o ON o.org_id = u.org_id
`

const USER_QUERY = `${USER_FIELDS} WHERE LOWER(u.email) = LOWER($1) AND u.status = 'active'`

export const publicUser = (user) => ({
  id: user.id,
  uuid: user.uuid,
  name: user.name,
  email: user.email,
  role: user.role,
  role_code: user.role_code || roleCode(user.role),
  region: user.region,
  org_id: user.org_id,
  organization: user.organization,
  mfa_enabled: Boolean(user.mfa_enabled),
  // Changes whenever the photo changes, so browsers never show an old cached one.
  avatar_version: user.avatar_updated_at ? new Date(user.avatar_updated_at).getTime() : null,
  // The app shows the acceptance screen when `required` is true (the API refuses everything else meanwhile).
  privacy: {
    version: config.privacy.version,
    accepted_version: user.privacy_version || null,
    accepted_at: user.privacy_accepted_at || null,
    required: consentRequired(user.role, user.privacy_version),
  },
})

/** Technical Spec §3.1: privileged roles must use MFA (enforced when MFA_ENFORCE=true). */
const mustSetUpMfa = (user) =>
  config.security.enforceMfa && MFA_REQUIRED_ROLES.includes(user.role) && !user.mfa_enabled

export async function audit(userId, action, details = {}) {
  await query(
    'INSERT INTO audit_logs (user_id, action, entity, details) VALUES ($1, $2, $3, $4)',
    [userId, action, 'auth', JSON.stringify(details)],
  )
}

export function signToken(user, extra = {}) {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role, sv: user.session_version ?? 0, ...extra },
    config.jwtSecret,
    { expiresIn: '8h' },
  )
}

export async function login(req, res) {
  const { email, password } = req.body || {}

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }

  const { rows } = await query(USER_QUERY, [String(email).trim()])
  const user = rows[0]

  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
    await audit(null, 'LOGIN_FAILED', { email: String(email).trim() })
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  await audit(user.id, 'LOGIN_SUCCESS')
  return res.json({ data: await sessionResponse(user) })
}

/** The next login step after the first factor. Password and single sign-on share it, so MFA always applies. */
export async function sessionResponse(user) {
  if (user.mfa_enabled) {
    const mfaToken = jwt.sign({ sub: user.id, purpose: 'mfa' }, config.jwtSecret, {
      expiresIn: '5m',
    })
    const keys = await query('SELECT COUNT(*)::int AS total FROM webauthn_credentials WHERE user_id = $1', [user.id])
    return {
      mfa_required: true,
      mfa_token: mfaToken,
      mfa_methods: { totp: Boolean(user.mfa_secret), webauthn: keys.rows[0].total > 0 },
    }
  }

  if (mustSetUpMfa(user)) {
    await audit(user.id, 'MFA_SETUP_REQUIRED')
    return {
      token: signToken(user, { mfa_setup: true }),
      user: publicUser(user),
      mfa_setup_required: true,
    }
  }

  return {
    token: signToken(user),
    user: publicUser(user),
  }
}

export async function mfaSetup(req, res) {
  const secret = generateSecret()
  // Never replaces active MFA: a stolen session must not be able to switch it off without a code.
  const { rowCount } = await query('UPDATE users SET mfa_secret = $1 WHERE id = $2 AND mfa_enabled = false', [
    secret,
    req.user.sub,
  ])
  if (!rowCount) {
    return res.status(409).json({ message: 'MFA is already active. Remove your current method before setting up a new authenticator.' })
  }
  return res.json({
    data: { secret, uri: otpauthUrl(req.user.email, secret, 'Global Group') },
  })
}

async function currentSecret(userId) {
  const { rows } = await query('SELECT mfa_secret FROM users WHERE id = $1', [userId])
  return rows[0]?.mfa_secret
}

export async function mfaEnable(req, res) {
  const secret = await currentSecret(req.user.sub)
  if (!secret || !verifyCode(secret, req.body?.code)) {
    return res.status(400).json({ message: 'Invalid authentication code.' })
  }
  await query('UPDATE users SET mfa_enabled = true WHERE id = $1', [req.user.sub])
  await audit(req.user.sub, 'MFA_ENABLED')
  // A session that was limited to MFA setup becomes a full session.
  const { rows } = await query(`${USER_FIELDS} WHERE u.id = $1`, [req.user.sub])
  return res.json({
    message: 'Multi-factor authentication enabled.',
    data: { token: signToken(rows[0]), user: publicUser(rows[0]) },
  })
}

export async function mfaDisable(req, res) {
  const keys = await query('SELECT COUNT(*)::int AS total FROM webauthn_credentials WHERE user_id = $1', [req.user.sub])
  const keepsKeys = keys.rows[0].total > 0
  if (!keepsKeys && config.security.enforceMfa && MFA_REQUIRED_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'MFA is mandatory for your role and cannot be disabled.' })
  }
  const secret = await currentSecret(req.user.sub)
  if (!secret || !verifyCode(secret, req.body?.code)) {
    return res.status(400).json({ message: 'Invalid authentication code.' })
  }
  await query('UPDATE users SET mfa_enabled = $2, mfa_secret = NULL WHERE id = $1', [req.user.sub, keepsKeys])
  await audit(req.user.sub, keepsKeys ? 'MFA_TOTP_REMOVED' : 'MFA_DISABLED')
  return res.json({ message: keepsKeys ? 'Authenticator app removed. Your security keys stay active.' : 'Multi-factor authentication disabled.' })
}

export async function mfaVerify(req, res) {
  const { mfa_token, code } = req.body || {}
  let claims
  try {
    claims = jwt.verify(mfa_token, config.jwtSecret)
  } catch {
    return res.status(401).json({ message: 'Invalid or expired MFA token.' })
  }
  if (claims.purpose !== 'mfa') {
    return res.status(401).json({ message: 'Invalid MFA token.' })
  }

  const { rows } = await query(`${USER_FIELDS} WHERE u.id = $1 AND u.status = 'active'`, [claims.sub])
  const user = rows[0]
  if (!user || !verifyCode(user.mfa_secret, code)) {
    return res.status(401).json({ message: 'Invalid authentication code.' })
  }

  return res.json({ data: { token: signToken(user, { region: user.region }), user: publicUser(user) } })
}

const RESET_MESSAGE = 'If an account exists for that email, a password reset link has been sent.'

export async function requestPasswordReset(req, res) {
  const email = String(req.body?.email || '').trim()
  if (!email) return res.status(400).json({ message: 'Email is required.' })

  const { rows } = await query(
    "SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) AND status = 'active'",
    [email],
  )
  // Same response whether or not the account exists, so emails cannot be enumerated.
  if (!rows[0]) return res.json({ message: RESET_MESSAGE })

  const token = randomBytes(24).toString('hex')
  // Only the newest link stays valid.
  await query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [rows[0].id])
  await query(
    'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')',
    [rows[0].id, token],
  )
  await audit(rows[0].id, 'PASSWORD_RESET_REQUESTED')

  const link = `${config.frontendOrigin}/reset-password?token=${token}`
  const body = { message: RESET_MESSAGE }

  if (smtpConfigured()) {
    try {
      await sendMail({
        to: rows[0].email,
        subject: 'Global Group — reset your password',
        text: `A password reset was requested for your Global Group account.\n\nReset it here (valid for 1 hour):\n${link}\n\nIf you did not request this, ignore this email.`,
      })
    } catch (error) {
      await audit(rows[0].id, 'PASSWORD_RESET_EMAIL_FAILED', { error: error.message })
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // Development convenience: no mail provider, so hand the token back directly.
    body.token = token
  }
  return res.json(body)
}

export async function confirmPasswordReset(req, res) {
  const { token, new_password } = req.body || {}
  if (!token || String(new_password || '').length < 8) {
    return res.status(400).json({ message: 'A valid token and a password of at least 8 characters are required.' })
  }

  const { rows } = await query(
    'SELECT user_id FROM password_resets WHERE token = $1 AND used_at IS NULL AND expires_at > now()',
    [token],
  )
  if (!rows[0]) return res.status(400).json({ message: 'Invalid or expired reset token.' })

  const hash = await bcrypt.hash(String(new_password), 12)
  // Every existing session ends: someone who stole the old password is signed out too.
  await query('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2', [hash, rows[0].user_id])
  await query('UPDATE password_resets SET used_at = now() WHERE token = $1', [token])
  await audit(rows[0].user_id, 'PASSWORD_RESET_COMPLETED')
  return res.json({ message: 'Password updated. You can sign in now.' })
}

/** Signed-in users change their own password. Existing sessions stay valid until they expire. */
export async function changePassword(req, res) {
  const current = String(req.body?.current_password || '')
  const next = String(req.body?.new_password || '')
  if (next.length < 12 || next.length > 200) {
    return res.status(400).json({ message: 'The new password must have 12 to 200 characters.' })
  }
  const { rows } = await query("SELECT password_hash FROM users WHERE id = $1 AND status = 'active'", [req.user.sub])
  if (!rows[0] || !(await bcrypt.compare(current, rows[0].password_hash))) {
    await audit(req.user.sub, 'PASSWORD_CHANGE_FAILED')
    return res.status(400).json({ message: 'Your current password is not correct.' })
  }
  if (await bcrypt.compare(next, rows[0].password_hash)) {
    return res.status(400).json({ message: 'Choose a password you have not used here before.' })
  }
  await query('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2', [await bcrypt.hash(next, 12), req.user.sub])
  await query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [req.user.sub])
  await audit(req.user.sub, 'PASSWORD_CHANGED')
  // Other devices are signed out; this one gets a fresh session.
  const { rows: fresh } = await query(`${USER_FIELDS} WHERE u.id = $1`, [req.user.sub])
  return res.json({ message: 'Password changed.', data: { token: signToken(fresh[0]), user: publicUser(fresh[0]) } })
}

/** Ends every session of the signed-in user, on all devices, including this one. */
export async function logoutEverywhere(req, res) {
  await query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [req.user.sub])
  await audit(req.user.sub, 'LOGOUT_EVERYWHERE')
  return res.json({ message: 'Signed out on all devices.' })
}

export async function me(req, res) {
  const { rows } = await query(`${USER_FIELDS} WHERE u.id = $1 AND u.status = 'active'`, [req.user.sub])

  if (!rows[0]) {
    return res.status(401).json({ message: 'Account no longer exists.' })
  }

  return res.json({ data: publicUser(rows[0]) })
}

export async function logout(req, res) {
  await audit(req.user?.sub || null, 'LOGOUT')
  return res.json({ message: 'Signed out.' })
}

import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { config } from '../config/env.js'
import { query } from '../config/database.js'
import { generateSecret, otpauthUrl, verifyCode } from '../services/totp.js'
import { sendMail, smtpConfigured } from '../services/email.service.js'
import { MFA_REQUIRED_ROLES, roleCode } from '../config/roles.js'

const USER_FIELDS = `
  SELECT u.id, u.uuid, u.name, u.email, u.password_hash, u.mfa_secret, u.mfa_enabled, u.org_id,
         r.name AS role, r.code AS role_code, rg.code AS region, o.legal_name AS organization
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN regions rg ON rg.id = u.region_id
  LEFT JOIN organizations o ON o.org_id = u.org_id
`

const USER_QUERY = `${USER_FIELDS} WHERE LOWER(u.email) = LOWER($1) AND u.status = 'active'`

const publicUser = (user) => ({
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
})

/** Technical Spec §3.1: privileged roles must use MFA (enforced when MFA_ENFORCE=true). */
const mustSetUpMfa = (user) =>
  config.security.enforceMfa && MFA_REQUIRED_ROLES.includes(user.role) && !user.mfa_enabled

async function audit(userId, action, details = {}) {
  await query(
    'INSERT INTO audit_logs (user_id, action, entity, details) VALUES ($1, $2, $3, $4)',
    [userId, action, 'auth', JSON.stringify(details)],
  )
}

function signToken(user, extra = {}) {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role, ...extra },
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

  if (user.mfa_enabled) {
    const mfaToken = jwt.sign({ sub: user.id, purpose: 'mfa' }, config.jwtSecret, {
      expiresIn: '5m',
    })
    return res.json({ data: { mfa_required: true, mfa_token: mfaToken } })
  }

  if (mustSetUpMfa(user)) {
    await audit(user.id, 'MFA_SETUP_REQUIRED')
    return res.json({
      data: {
        token: signToken(user, { mfa_setup: true }),
        user: publicUser(user),
        mfa_setup_required: true,
      },
    })
  }

  return res.json({
    data: {
      token: signToken(user),
      user: publicUser(user),
    },
  })
}

export async function mfaSetup(req, res) {
  const secret = generateSecret()
  await query('UPDATE users SET mfa_secret = $1, mfa_enabled = false WHERE id = $2', [
    secret,
    req.user.sub,
  ])
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
  if (config.security.enforceMfa && MFA_REQUIRED_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'MFA is mandatory for your role and cannot be disabled.' })
  }
  const secret = await currentSecret(req.user.sub)
  if (!secret || !verifyCode(secret, req.body?.code)) {
    return res.status(400).json({ message: 'Invalid authentication code.' })
  }
  await query('UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1', [req.user.sub])
  await audit(req.user.sub, 'MFA_DISABLED')
  return res.json({ message: 'Multi-factor authentication disabled.' })
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

  const access = jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role, region: user.region },
    config.jwtSecret,
    { expiresIn: '8h' },
  )
  return res.json({ data: { token: access, user: publicUser(user) } })
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
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, rows[0].user_id])
  await query('UPDATE password_resets SET used_at = now() WHERE token = $1', [token])
  await audit(rows[0].user_id, 'PASSWORD_RESET_COMPLETED')
  return res.json({ message: 'Password updated. You can sign in now.' })
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

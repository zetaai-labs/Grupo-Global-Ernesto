import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { config } from '../config/env.js'
import { query } from '../config/database.js'
import { MFA_REQUIRED_ROLES } from '../config/roles.js'
import { audit, sessionResponse, USER_FIELDS } from './auth.controller.js'
import { authorizationUrl, exchangeCode, oidcConfigured, oidcProviderName, verifyIdToken } from '../integrations/oidc/oidcClient.js'

/**
 * Single sign-on routes. The session token never appears in a URL: the callback leaves a short-lived
 * encrypted cookie, and the login page exchanges it once through a same-site POST.
 */

const FLOW_COOKIE = 'gg_oidc_flow'
const RESULT_COOKIE = 'gg_oidc_result'
const COOKIE_PATH = '/api/auth/oidc'
const FLOW_SECONDS = 600
const RESULT_SECONDS = 60
/** These accounts may use SSO only with their own MFA on top, since the provider's login alone is not enough. */
const SSO_NEEDS_MFA = [...MFA_REQUIRED_ROLES, 'investor']

const cookieKey = () => Buffer.from(hkdfSync('sha256', config.jwtSecret, Buffer.alloc(0), 'gg-oidc-cookie-v1', 32))

function seal(purpose, payload, seconds) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', cookieKey(), iv)
  cipher.setAAD(Buffer.from(purpose))
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...payload, exp: Date.now() + seconds * 1000 }), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.')
}

function unseal(purpose, value) {
  try {
    const [iv, tag, body] = String(value).split('.').map((part) => Buffer.from(part, 'base64url'))
    const decipher = createDecipheriv('aes-256-gcm', cookieKey(), iv)
    decipher.setAAD(Buffer.from(purpose))
    decipher.setAuthTag(tag)
    const payload = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'))
    return payload.exp > Date.now() ? payload : null
  } catch {
    return null
  }
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}

const cookieOptions = (maxAge) => ({
  httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: COOKIE_PATH, maxAge: maxAge * 1000,
})
const clearCookie = (res, name) => res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: COOKIE_PATH })
const loginPage = () => config.frontendOrigin.split(',')[0].trim().replace(/\/$/, '')
const backToLogin = (res, code) => res.redirect(302, `${loginPage()}/login?sso_error=${code}`)

function sameValue(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  return left.length === right.length && timingSafeEqual(left, right)
}

const ssoAllowed = (user) => !SSO_NEEDS_MFA.includes(user.role) || Boolean(user.mfa_enabled)

export function oidcStatus(_req, res) {
  const enabled = oidcConfigured()
  return res.json({ data: { enabled, provider: enabled ? oidcProviderName() : null } })
}

export async function oidcStart(_req, res) {
  if (!oidcConfigured()) return backToLogin(res, 'unavailable')
  const flow = {
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    verifier: randomBytes(48).toString('base64url'),
  }
  try {
    const url = await authorizationUrl(flow)
    res.cookie(FLOW_COOKIE, seal(FLOW_COOKIE, flow, FLOW_SECONDS), cookieOptions(FLOW_SECONDS))
    return res.redirect(302, url)
  } catch {
    return backToLogin(res, 'unavailable')
  }
}

export async function oidcCallback(req, res) {
  const flow = unseal(FLOW_COOKIE, readCookie(req, FLOW_COOKIE))
  clearCookie(res, FLOW_COOKIE)
  if (!oidcConfigured()) return backToLogin(res, 'unavailable')
  if (!flow || typeof req.query.state !== 'string' || !sameValue(flow.state, req.query.state)) {
    await audit(null, 'SSO_LOGIN_REJECTED', { reason: 'state' })
    return backToLogin(res, 'failed')
  }
  if (req.query.error) return backToLogin(res, 'denied')
  if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096) return backToLogin(res, 'failed')

  let claims
  try {
    claims = await verifyIdToken(await exchangeCode(req.query.code, flow.verifier), flow.nonce)
  } catch {
    await audit(null, 'SSO_LOGIN_REJECTED', { reason: 'token' })
    return backToLogin(res, 'failed')
  }

  // An account is bound to the provider's permanent subject on its first SSO sign-in.
  // After that only that subject can open it, whatever email the provider later reports.
  const issuer = String(claims.iss)
  const subject = String(claims.sub)
  let user = (await query(`${USER_FIELDS} WHERE u.oidc_issuer = $1 AND u.oidc_subject = $2 AND u.status = 'active'`, [issuer, subject])).rows[0]

  if (!user) {
    // First sign-in: only a provider-verified email can match an account. Accounts are never created here.
    if (claims.email_verified !== true || typeof claims.email !== 'string') {
      await audit(null, 'SSO_LOGIN_REJECTED', { reason: 'email_not_verified' })
      return backToLogin(res, 'not_allowed')
    }
    user = (await query(`${USER_FIELDS} WHERE LOWER(u.email) = LOWER($1) AND u.status = 'active'`, [claims.email.trim()])).rows[0]
    if (user && ssoAllowed(user)) {
      const linked = await query(
        `UPDATE users SET oidc_issuer = $2, oidc_subject = $3, oidc_linked_at = now() WHERE id = $1 AND oidc_subject IS NULL`,
        [user.id, issuer, subject],
      )
      if (!linked.rowCount) {
        await audit(user.id, 'SSO_LOGIN_REJECTED', { reason: 'linked_to_another_identity' })
        return backToLogin(res, 'not_allowed')
      }
      await audit(user.id, 'SSO_ACCOUNT_LINKED')
    }
  }
  if (!user || !ssoAllowed(user)) {
    await audit(user?.id || null, 'SSO_LOGIN_REJECTED', { reason: user ? 'mfa_required' : 'no_account' })
    return backToLogin(res, 'not_allowed')
  }

  await audit(user.id, 'LOGIN_SUCCESS', { method: 'oidc' })
  res.cookie(RESULT_COOKIE, seal(RESULT_COOKIE, { user_id: user.id }, RESULT_SECONDS), cookieOptions(RESULT_SECONDS))
  return res.redirect(302, `${loginPage()}/login?sso=1`)
}

export async function oidcComplete(req, res) {
  const result = unseal(RESULT_COOKIE, readCookie(req, RESULT_COOKIE))
  clearCookie(res, RESULT_COOKIE)
  if (!result) return res.status(401).json({ message: 'Single sign-on could not be completed. Please try again.' })
  const { rows } = await query(`${USER_FIELDS} WHERE u.id = $1 AND u.status = 'active'`, [result.user_id])
  if (!rows[0] || !ssoAllowed(rows[0])) return res.status(401).json({ message: 'Single sign-on could not be completed. Please try again.' })
  return res.json({ data: await sessionResponse(rows[0]) })
}

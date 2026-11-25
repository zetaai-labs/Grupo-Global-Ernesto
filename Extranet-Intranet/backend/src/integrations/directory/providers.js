import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'

/**
 * Company accounts in Google Workspace (Admin SDK Directory API) and Microsoft 365 (Graph).
 * Google uses a service account with domain-wide delegation; Microsoft uses an app registration
 * with User.ReadWrite.All application permission. Both stay off until their settings exist.
 */

const TIMEOUT_MS = 15000
const tokens = {}

export function resetDirectoryTokens() {
  for (const key of Object.keys(tokens)) delete tokens[key]
}

export const googleConfigured = () => Boolean(
  process.env.GOOGLE_SA_CLIENT_EMAIL?.trim() && process.env.GOOGLE_SA_PRIVATE_KEY?.trim()
  && process.env.GOOGLE_ADMIN_SUBJECT?.trim() && process.env.GOOGLE_WORKSPACE_DOMAIN?.trim(),
)
export const microsoftConfigured = () => Boolean(
  process.env.MS_TENANT_ID?.trim() && process.env.MS_CLIENT_ID?.trim() && process.env.MS_CLIENT_SECRET?.trim() && process.env.MS_DOMAIN?.trim(),
)
export const providerConfigured = (provider) => (provider === 'GOOGLE' ? googleConfigured() : microsoftConfigured())
export const providerDomain = (provider) => String((provider === 'GOOGLE' ? process.env.GOOGLE_WORKSPACE_DOMAIN : process.env.MS_DOMAIN) || '').trim().toLowerCase()

const failure = (message) => Object.assign(new Error(message), { status: 502 })

/** A temporary password the person must change at first sign-in. Shown once, never stored. */
export function temporaryPassword() {
  return `${randomBytes(12).toString('base64url')}#7a`
}

/** Splits a display name for directories that need given and family names. */
export function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return { given: parts[0] || 'User', family: parts[0] || 'User' }
  return { given: parts[0], family: parts.slice(1).join(' ') }
}

/** firstname.lastname@domain, without accents or symbols. */
export function suggestedEmail(fullName, domain) {
  const clean = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const { given, family } = splitName(fullName)
  const local = [clean(given), clean(family.split(' ').pop())].filter(Boolean).join('.')
  return `${local || 'user'}@${domain}`
}

async function send(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const json = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, json }
}

async function googleToken() {
  if (tokens.google?.expires > Date.now() + 60000) return tokens.google.value
  const key = Buffer.from(process.env.GOOGLE_SA_PRIVATE_KEY.trim(), 'base64').toString('utf8')
  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign({
    iss: process.env.GOOGLE_SA_CLIENT_EMAIL.trim(),
    sub: process.env.GOOGLE_ADMIN_SUBJECT.trim(),
    scope: 'https://www.googleapis.com/auth/admin.directory.user',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }, key, { algorithm: 'RS256' })
  const { ok, json } = await send('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!ok || !json.access_token) throw failure('Google Workspace refused the service account.')
  tokens.google = { value: json.access_token, expires: Date.now() + Number(json.expires_in || 3600) * 1000 }
  return tokens.google.value
}

async function microsoftToken() {
  if (tokens.microsoft?.expires > Date.now() + 60000) return tokens.microsoft.value
  const { ok, json } = await send(`https://login.microsoftonline.com/${encodeURIComponent(process.env.MS_TENANT_ID.trim())}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: process.env.MS_CLIENT_ID.trim(), client_secret: process.env.MS_CLIENT_SECRET.trim(),
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!ok || !json.access_token) throw failure('Microsoft 365 refused the app credentials.')
  tokens.microsoft = { value: json.access_token, expires: Date.now() + Number(json.expires_in || 3600) * 1000 }
  return tokens.microsoft.value
}

/** Creates the account. Returns { externalId }. Throws with status 409 if the address is taken. */
export async function createAccount(provider, { email, fullName, password }) {
  const { given, family } = splitName(fullName)
  if (provider === 'GOOGLE') {
    const { ok, status, json } = await send('https://admin.googleapis.com/admin/directory/v1/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryEmail: email, name: { givenName: given, familyName: family }, password, changePasswordAtNextLogin: true }),
    })
    if (status === 409) throw Object.assign(new Error('That address already exists in Google Workspace.'), { status: 409 })
    if (!ok || !json.id) throw failure('Google Workspace could not create the account.')
    return { externalId: json.id }
  }
  const { ok, status, json } = await send('https://graph.microsoft.com/v1.0/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await microsoftToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountEnabled: true, displayName: fullName, givenName: given, surname: family,
      mailNickname: email.split('@')[0], userPrincipalName: email,
      passwordProfile: { forceChangePasswordNextSignIn: true, password },
    }),
  })
  if (status === 400 && JSON.stringify(json).includes('ObjectConflict')) throw Object.assign(new Error('That address already exists in Microsoft 365.'), { status: 409 })
  if (!ok || !json.id) throw failure('Microsoft 365 could not create the account.')
  return { externalId: json.id }
}

/** Blocks sign-in without deleting the mailbox, so data stays available to the company. */
export async function suspendAccount(provider, email) {
  if (provider === 'GOOGLE') {
    const { ok } = await send(`https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended: true }),
    })
    if (!ok) throw failure('Google Workspace could not suspend the account.')
    return
  }
  const { ok, status } = await send(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await microsoftToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountEnabled: false }),
  })
  if (!ok && status !== 204) throw failure('Microsoft 365 could not suspend the account.')
}

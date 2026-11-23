import { createHash, createPublicKey } from 'node:crypto'
import jwt from 'jsonwebtoken'

/**
 * OpenID Connect sign-in (Technical Spec §2.1) using the authorization code flow with PKCE.
 * Works with any standard provider, including a WordPress OIDC server plugin.
 * Off until OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI are set.
 */

const TIMEOUT_MS = 8000
const MAX_RESPONSE_BYTES = 1024 * 1024
const CACHE_MS = 60 * 60 * 1000
const JWKS_REFRESH_MS = 30 * 1000
const ALLOWED_ALGORITHMS = ['RS256', 'ES256']

let discoveryCache = null
let jwksCache = null

export function resetOidcCache() {
  discoveryCache = null
  jwksCache = null
}

/** HTTPS only, except plain HTTP to this machine outside production. */
function safeUrl(value) {
  const url = new URL(value)
  if (url.username || url.password) throw new Error('Credentials are not allowed in OIDC URLs.')
  const local = ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production')) return url
  throw new Error('OIDC URLs must use HTTPS.')
}

const settings = () => ({
  issuer: String(process.env.OIDC_ISSUER || '').trim(),
  clientId: String(process.env.OIDC_CLIENT_ID || '').trim(),
  clientSecret: String(process.env.OIDC_CLIENT_SECRET || ''),
  redirectUri: String(process.env.OIDC_REDIRECT_URI || '').trim(),
  scopes: String(process.env.OIDC_SCOPES || 'openid email profile').trim(),
})

export function oidcConfigured() {
  const s = settings()
  if (!s.issuer || !s.clientId || !s.clientSecret || !s.redirectUri) return false
  try {
    safeUrl(s.issuer)
    safeUrl(s.redirectUri)
    return true
  } catch {
    return false
  }
}

export const oidcProviderName = () => String(process.env.OIDC_PROVIDER_NAME || 'Grupo Global').trim().slice(0, 60)

async function fetchJson(url, options = {}) {
  const response = await fetch(safeUrl(url), { ...options, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
  const text = await response.text()
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('OIDC response is too large.')
  if (!response.ok) throw new Error(`OIDC request failed (${response.status}).`)
  return JSON.parse(text)
}

async function discovery() {
  const { issuer } = settings()
  if (discoveryCache?.issuer === issuer && discoveryCache.expires > Date.now()) return discoveryCache.document
  const document = await fetchJson(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)
  if (document.issuer !== issuer) throw new Error('OIDC issuer does not match.')
  for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) safeUrl(document[key])
  discoveryCache = { issuer, document, expires: Date.now() + CACHE_MS }
  return document
}

export const pkceChallenge = (verifier) => createHash('sha256').update(verifier).digest('base64url')

export async function authorizationUrl({ state, nonce, verifier }) {
  const s = settings()
  const url = new URL((await discovery()).authorization_endpoint)
  url.search = new URLSearchParams({
    ...Object.fromEntries(url.searchParams),
    response_type: 'code',
    client_id: s.clientId,
    redirect_uri: s.redirectUri,
    scope: s.scopes,
    state,
    nonce,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
  }).toString()
  return url.toString()
}

export async function exchangeCode(code, verifier) {
  const s = settings()
  const document = await discovery()
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: s.redirectUri, code_verifier: verifier })
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  const methods = document.token_endpoint_auth_methods_supported || ['client_secret_basic']
  if (methods.includes('client_secret_basic')) {
    headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(s.clientId)}:${encodeURIComponent(s.clientSecret)}`).toString('base64')}`
  } else {
    body.set('client_id', s.clientId)
    body.set('client_secret', s.clientSecret)
  }
  const tokens = await fetchJson(document.token_endpoint, { method: 'POST', headers, body })
  if (typeof tokens.id_token !== 'string') throw new Error('The provider did not return an ID token.')
  return tokens.id_token
}

async function signingKey(kid, alg) {
  const { jwks_uri: uri } = await discovery()
  const find = (keys) => keys.find((key) => (!kid || key.kid === kid) && (!key.use || key.use === 'sig') && (!key.alg || key.alg === alg) && key.kty === (alg === 'RS256' ? 'RSA' : 'EC'))
  const fresh = jwksCache?.uri === uri && jwksCache.expires > Date.now()
  let key = fresh ? find(jwksCache.keys) : null
  if (!key && (!jwksCache || jwksCache.uri !== uri || Date.now() - jwksCache.fetched > JWKS_REFRESH_MS || !fresh)) {
    const body = await fetchJson(uri)
    const keys = Array.isArray(body.keys) ? body.keys : []
    jwksCache = { uri, keys, fetched: Date.now(), expires: Date.now() + CACHE_MS }
    key = find(keys)
  }
  if (!key) throw new Error('No matching OIDC signing key.')
  return createPublicKey({ key, format: 'jwk' })
}

/** Verifies signature, issuer, audience, expiry and nonce, and returns the claims. */
export async function verifyIdToken(idToken, nonce) {
  const s = settings()
  const decoded = jwt.decode(idToken, { complete: true })
  const alg = decoded?.header?.alg
  if (!ALLOWED_ALGORITHMS.includes(alg)) throw new Error('OIDC token algorithm is not allowed.')
  const key = await signingKey(decoded.header.kid, alg)
  const claims = jwt.verify(idToken, key, { algorithms: [alg], issuer: s.issuer, audience: s.clientId, clockTolerance: 60 })
  if (!claims.sub) throw new Error('OIDC token has no subject.')
  if (claims.nonce !== nonce) throw new Error('OIDC nonce does not match.')
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if ((audiences.length > 1 || claims.azp) && claims.azp !== s.clientId) throw new Error('OIDC authorized party does not match.')
  return claims
}

import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { query } from '../config/database.js'
import { isExternal } from '../config/roles.js'

/**
 * Session-aware navigation for the public WordPress site (Technical Spec §2.1).
 * The site loads /api/public/nav.js, which asks /api/public/nav/session who is signed in.
 * The answer relies on an HttpOnly cookie the browser sends to the app only: WordPress never
 * sees a token. Off until NAV_ALLOWED_ORIGINS lists the site address(es).
 */

const COOKIE = 'gg_nav'
const MAX_AGE_SECONDS = 8 * 60 * 60

const allowedOrigins = () => String(process.env.NAV_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean)
export const navConfigured = () => allowedOrigins().length > 0
const appUrl = () => config.frontendOrigin.split(',')[0].trim().replace(/\/$/, '')

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/api',
  ...(process.env.NAV_COOKIE_DOMAIN ? { domain: process.env.NAV_COOKIE_DOMAIN.trim() } : {}),
})

function readCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === COOKIE) return part.slice(index + 1).trim()
  }
  return null
}

/** Called by the app after sign-in (authenticated). Sets the navigation cookie. */
export function startNavSession(req, res) {
  if (!navConfigured()) return res.status(204).end()
  const token = jwt.sign({ sub: req.user.sub, sv: req.user.session_version ?? 0, purpose: 'nav' }, config.jwtSecret, { expiresIn: MAX_AGE_SECONDS })
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: MAX_AGE_SECONDS * 1000 })
  return res.status(204).end()
}

export function endNavSession(_req, res) {
  res.clearCookie(COOKIE, cookieOptions())
  return res.status(204).end()
}

function corsFor(req, res) {
  const origin = String(req.get('origin') || '').replace(/\/$/, '')
  res.set('Vary', 'Origin')
  if (!origin || !allowedOrigins().includes(origin)) return false
  res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET' })
  return true
}

const LINKS = {
  intranet: [['Workspace', '/intranet/overview'], ['ZYLAX', '/intranet/zylax'], ['Notifications', '/intranet/overview']],
  extranet: [['My portal', '/extranet/overview'], ['Quotes & Orders', '/extranet/orders'], ['Billing', '/extranet/billing']],
  investor: [['Investor Vault', '/extranet/investor-vault']],
}

export async function navSession(req, res) {
  res.set('Cache-Control', 'no-store')
  if (!navConfigured()) return res.status(404).end()
  if (!corsFor(req, res)) return res.status(403).json({ message: 'Origin not allowed.' })
  const signedOut = { signed_in: false, login_url: `${appUrl()}/login` }

  let claims
  try {
    claims = jwt.verify(readCookie(req) || '', config.jwtSecret)
  } catch {
    return res.json(signedOut)
  }
  if (claims.purpose !== 'nav') return res.json(signedOut)

  const { rows } = await query(
    `SELECT u.id, u.name, u.status, u.session_version, r.name AS role,
            (SELECT count(*)::int FROM notifications n WHERE n.user_id = u.id AND n.read_at IS NULL) AS unread
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [claims.sub],
  )
  const user = rows[0]
  if (!user || user.status !== 'active' || (claims.sv ?? 0) !== user.session_version) return res.json(signedOut)

  const set = user.role === 'investor' ? 'investor' : isExternal(user.role) ? 'extranet' : 'intranet'
  const initials = String(user.name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
  return res.json({
    signed_in: true,
    name: user.name,
    initials,
    unread_notifications: user.unread,
    links: LINKS[set].map(([label, path]) => ({ label, url: `${appUrl()}${path}` })),
    app_url: `${appUrl()}${set === 'intranet' ? '/intranet' : '/extranet'}`,
  })
}

export function navPreflight(req, res) {
  if (!navConfigured() || !corsFor(req, res)) return res.status(403).end()
  return res.status(204).end()
}

/** The embeddable script. It builds the bar with DOM methods only (no HTML strings), inside a shadow root. */
const SCRIPT = `(() => {
  const script = document.currentScript
  if (!script) return
  const api = new URL(script.src).origin
  const host = document.getElementById('gg-nav')
  if (!host || host.dataset.ggReady) return
  host.dataset.ggReady = '1'
  const root = host.attachShadow({ mode: 'open' })
  const es = (document.documentElement.lang || '').toLowerCase().startsWith('es')
  const words = es
    ? { signIn: 'Iniciar sesión', notifications: 'Notificaciones', Workspace: 'Espacio de trabajo', 'My portal': 'Mi portal', 'Quotes & Orders': 'Presupuestos y pedidos', Billing: 'Facturación', Notifications: 'Notificaciones', 'Investor Vault': 'Bóveda de Inversores', ZYLAX: 'ZYLAX' }
    : { signIn: 'Sign in', notifications: 'Notifications' }
  const say = (text) => words[text] || text
  const style = document.createElement('style')
  style.textContent = ':host{all:initial}.bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font:14px/1.3 system-ui,sans-serif;color:inherit}a{color:inherit;text-decoration:none;padding:6px 10px;border-radius:8px}a:hover,a:focus-visible{background:rgba(0,0,0,.06)}.who{display:flex;align-items:center;gap:8px;font-weight:600}.avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#0a2f6b;color:#fff;font-size:12px}.badge{min-width:18px;padding:1px 6px;border-radius:999px;background:#b91c1c;color:#fff;font-size:11px;text-align:center}'
  const bar = document.createElement('nav')
  bar.className = 'bar'
  bar.setAttribute('aria-label', 'Grupo Global')
  root.append(style, bar)
  const link = (text, href) => { const a = document.createElement('a'); a.href = href; a.textContent = say(text); return a }
  const render = (data) => {
    bar.replaceChildren()
    if (!data || !data.signed_in) { if (data && data.login_url) bar.append(link('signIn', data.login_url)); return }
    const who = document.createElement('a')
    who.className = 'who'
    who.href = data.app_url
    const avatar = document.createElement('span')
    avatar.className = 'avatar'
    avatar.textContent = data.initials
    who.append(avatar, document.createTextNode(data.name))
    bar.append(who)
    for (const item of data.links) {
      const a = link(item.label, item.url)
      if (item.label === 'Notifications' && data.unread_notifications > 0) {
        const badge = document.createElement('span')
        badge.className = 'badge'
        badge.textContent = String(data.unread_notifications)
        badge.setAttribute('aria-label', data.unread_notifications + ' ' + say('notifications'))
        a.append(' ', badge)
      }
      bar.append(a)
    }
  }
  const load = () => fetch(api + '/api/public/nav/session', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then(render).catch(() => {})
  load()
  setInterval(() => { if (document.visibilityState === 'visible') load() }, 60000)
})()
`

export function navScript(_req, res) {
  if (!navConfigured()) return res.status(404).end()
  res.set({
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
  return res.send(SCRIPT)
}

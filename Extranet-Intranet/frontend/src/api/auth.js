const TOKEN_KEY = 'gg_token'
const USER_KEY = 'gg_user'

export const PORTAL_ROLES = {
  intranet: ['admin', 'employee', 'hr', 'manager'],
  extranet: ['partner', 'client', 'supplier'],
}

function read(storage) {
  const raw = storage.getItem(TOKEN_KEY)
  if (!raw) return null
  return raw
}

export function getToken() {
  if (typeof window === 'undefined') return null
  return read(window.localStorage) || read(window.sessionStorage)
}

export function getUser() {
  if (typeof window === 'undefined') return null
  const raw =
    window.localStorage.getItem(USER_KEY) || window.sessionStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveSession(token, user, remember = true) {
  const storage = remember ? window.localStorage : window.sessionStorage
  storage.setItem(TOKEN_KEY, token)
  if (user) storage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
  window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(USER_KEY)
}

export function canAccessPortal(portal, role) {
  const allowed = PORTAL_ROLES[portal]
  return Boolean(allowed && allowed.includes(String(role || '').toLowerCase()))
}

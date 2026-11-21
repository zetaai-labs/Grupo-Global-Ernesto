const TOKEN_KEY = 'gg_token'
const USER_KEY = 'gg_user'

// Mirrors backend/src/config/roles.js (STAFF_ROLES / EXTERNAL_ROLES).
export const PORTAL_ROLES = {
  intranet: ['admin', 'tech_admin', 'hr', 'manager', 'employee'],
  extranet: ['partner', 'client', 'supplier', 'investor'],
}

/** Roles allowed to open the organisation registry (backend REGISTRY_READ_ROLES). */
export const REGISTRY_ROLES = ['admin', 'tech_admin', 'hr', 'manager']
/** Compliance Office: KYC screening and approval (backend COMPLIANCE_ROLES). */
export const COMPLIANCE_ROLES = ['admin', 'hr']
/** Super Admin + Technical Admin (backend SYSTEM_ADMIN_ROLES). */
export const SYSTEM_ADMIN_ROLES = ['admin', 'tech_admin']

export function hasRole(user, roles) {
  return roles.includes(String(user?.role || '').toLowerCase())
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

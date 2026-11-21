import { STAFF_ROLES, EXTERNAL_ROLES, SYSTEM_ADMIN_ROLES } from '../config/roles.js'
/** Role gate for API routes. Always mount after `authenticate`. */
export function requireRole(...allowed) {
  const roles = allowed.map((role) => String(role).toLowerCase())

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' })
    }

    if (!roles.includes(String(req.user.role || '').toLowerCase())) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' })
    }

    return next()
  }
}

/** Super Administrator only (ROLE_SUPER_ADMIN). */
export const requireAdmin = requireRole('admin')
/** Super Admin or Technical Admin: backups, audit log, account administration. */
export const requireSystemAdmin = requireRole(...SYSTEM_ADMIN_ROLES)
export const requireIntranet = requireRole(...STAFF_ROLES)
export const requireExtranet = requireRole(...EXTERNAL_ROLES)

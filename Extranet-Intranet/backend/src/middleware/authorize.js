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

export const requireAdmin = requireRole('admin')
export const requireIntranet = requireRole('admin', 'employee', 'hr', 'manager')
export const requireExtranet = requireRole('partner', 'client', 'supplier')

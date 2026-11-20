import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { query } from '../config/database.js'

/**
 * Verifies the JWT, then reloads the account from the database on every request.
 * A suspended/deleted user is blocked immediately, even with a valid token,
 * and role/region always come from the database rather than stale token claims.
 */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' })
  }

  let claims
  try {
    claims = jwt.verify(token, config.jwtSecret)
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' })
  }

  // Purpose-scoped tokens (e.g. the short-lived MFA challenge) are not session tokens.
  if (claims.purpose) {
    return res.status(401).json({ message: 'Invalid or expired token.' })
  }

  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.status, r.name AS role, rg.code AS region
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN regions rg ON rg.id = u.region_id
     WHERE u.id = $1`,
    [claims.sub],
  )

  const user = rows[0]
  if (!user || user.status !== 'active') {
    return res.status(401).json({ message: 'Account is not active.' })
  }

  req.user = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    region: user.region || 'GLOBAL',
  }
  return next()
}

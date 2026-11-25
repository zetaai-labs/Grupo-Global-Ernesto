import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { query } from '../config/database.js'
import { isExternal } from '../config/roles.js'
import { organisationScope } from '../services/scope.js'

const MFA_SETUP_PATHS = ['/api/auth/mfa/', '/api/auth/me', '/api/auth/logout', '/api/notifications']

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
    `SELECT u.id, u.uuid, u.name, u.email, u.status, u.org_id, u.session_version, r.name AS role, r.code AS role_code, rg.code AS region,
            o.verification_status AS org_status, o.org_type, o.parent_org_id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN regions rg ON rg.id = u.region_id
     LEFT JOIN organizations o ON o.org_id = u.org_id
     WHERE u.id = $1`,
    [claims.sub],
  )

  const user = rows[0]
  if (!user || user.status !== 'active') {
    return res.status(401).json({ message: 'Account is not active.' })
  }

  // Sessions issued before a password change, reset, suspension or "sign out everywhere" are no longer valid.
  if ((claims.sv ?? 0) !== user.session_version) {
    return res.status(401).json({ message: 'Your session has ended. Please sign in again.' })
  }

  // External accounts lose access as soon as their organisation is suspended or rejected.
  if (isExternal(user.role) && ['SUSPENDED', 'REJECTED'].includes(user.org_status)) {
    return res.status(401).json({ message: "Your organisation's access is suspended." })
  }

  req.user = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    region: user.region || 'GLOBAL',
    uuid: user.uuid,
    org_id: user.org_id,
    role_code: user.role_code,
    org_scope: organisationScope(user),
    session_version: user.session_version,
  }

  // Sessions issued for mandatory MFA setup may only reach the MFA and session endpoints.
  if (claims.mfa_setup && !MFA_SETUP_PATHS.some((path) => req.originalUrl.startsWith(path))) {
    return res.status(403).json({ code: 'MFA_SETUP_REQUIRED', message: 'Set up multi-factor authentication to continue.' })
  }
  return next()
}

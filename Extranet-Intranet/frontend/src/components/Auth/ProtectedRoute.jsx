import { Navigate, useLocation } from 'react-router-dom'
import { getToken, getUser, canAccessPortal } from '../../api/auth'

/**
 * Guards a portal tree. `portal` maps to the role set in api/auth.js.
 * `roles` can further restrict a single route (e.g. admin-only screens).
 */
function ProtectedRoute({ children, portal, roles }) {
  const location = useLocation()
  const token = getToken()
  const user = getUser()

  if (!token) {
    const query = portal ? `?workspace=${portal}` : ''
    return <Navigate to={`/login${query}`} replace state={{ from: location.pathname }} />
  }

  if (portal && !canAccessPortal(portal, user?.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  if (roles && !roles.includes(String(user?.role || '').toLowerCase())) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}

export default ProtectedRoute

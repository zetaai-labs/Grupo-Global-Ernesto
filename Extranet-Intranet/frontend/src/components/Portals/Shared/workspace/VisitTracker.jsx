import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getUser } from '../../../../api/auth'
import { visibleScreens } from '../navigation'
import { recordVisit } from './usage'

/** Remembers the screens a person opens, for "Recently used" on the Workspace page. */
function VisitTracker({ portal }) {
  const { pathname } = useLocation()
  useEffect(() => {
    const known = visibleScreens(portal, getUser()?.role).some((item) => item.path === pathname) || /^\/(intranet|extranet)\/zylax\/[a-z_]+$/.test(pathname)
    if (known && !pathname.endsWith('/workspace') && !pathname.endsWith('/overview')) recordVisit(pathname)
  }, [pathname, portal])
  return null
}

export default VisitTracker

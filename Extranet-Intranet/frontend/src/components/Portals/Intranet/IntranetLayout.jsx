
import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import IntranetSidebar from './IntranetSidebar'
import IntranetTopbar from './IntranetTopbar'
import BottomToolbar from '../Shared/BottomToolbar'
import HelpCenter from '../Shared/help/HelpCenter'
import VisitTracker from '../Shared/workspace/VisitTracker'
import '../Portal.css'

function IntranetLayout() {
  return (
    <div className="portal-shell intranet-shell">
      <IntranetSidebar />

      <div className="portal-main">
        <IntranetTopbar />

        <main className="portal-content">
          <Suspense fallback={<div className="page-loading" role="status" aria-live="polite" />}><Outlet /></Suspense>
        </main>
      </div>
      <BottomToolbar portal="intranet" />
      <HelpCenter />
      <VisitTracker portal="intranet" />
    </div>
  )
}

export default IntranetLayout

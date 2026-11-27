
import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import ExtranetSidebar from './ExtranetSidebar'
import ExtranetTopbar from './ExtranetTopbar'
import BottomToolbar from '../Shared/BottomToolbar'
import HelpCenter from '../Shared/help/HelpCenter'
import VisitTracker from '../Shared/workspace/VisitTracker'
import ConsentGate from '../Shared/privacy/ConsentGate'
import NdaBanner from '../Shared/NdaBanner'
import MembershipBanner from '../Shared/MembershipBanner'
import AssistantWidget from '../Shared/assistant/AssistantWidget'
import '../Portal.css'

function ExtranetLayout() {
  return (
    <div className="portal-shell extranet-shell">
      <ExtranetSidebar />

      <div className="portal-main">
        <ExtranetTopbar />

        <main className="portal-content">
          <NdaBanner />
          <MembershipBanner />
          <Suspense fallback={<div className="page-loading" role="status" aria-live="polite" />}><Outlet /></Suspense>
        </main>
      </div>
      <BottomToolbar portal="extranet" />
      <HelpCenter />
      <ConsentGate />
      <AssistantWidget raised />
      <VisitTracker portal="extranet" />
    </div>
  )
}

export default ExtranetLayout

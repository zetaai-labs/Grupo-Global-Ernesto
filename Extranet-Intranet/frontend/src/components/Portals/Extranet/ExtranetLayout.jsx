
import { Outlet } from 'react-router-dom'
import ExtranetSidebar from './ExtranetSidebar'
import ExtranetTopbar from './ExtranetTopbar'
import BottomToolbar from '../Shared/BottomToolbar'
import NdaBanner from '../Shared/NdaBanner'
import '../Portal.css'

function ExtranetLayout() {
  return (
    <div className="portal-shell extranet-shell">
      <ExtranetSidebar />

      <div className="portal-main">
        <ExtranetTopbar />

        <main className="portal-content">
          <NdaBanner />
          <Outlet />
        </main>
      </div>
      <BottomToolbar portal="extranet" />
    </div>
  )
}

export default ExtranetLayout

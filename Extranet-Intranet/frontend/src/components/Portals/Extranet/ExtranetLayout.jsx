
import { Outlet } from 'react-router-dom'
import ExtranetSidebar from './ExtranetSidebar'
import ExtranetTopbar from './ExtranetTopbar'
import '../Portal.css'

function ExtranetLayout() {
  return (
    <div className="portal-shell extranet-shell">
      <ExtranetSidebar />

      <div className="portal-main">
        <ExtranetTopbar />

        <main className="portal-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default ExtranetLayout

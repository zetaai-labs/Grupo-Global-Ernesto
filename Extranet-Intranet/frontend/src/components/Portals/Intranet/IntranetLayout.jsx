
import { Outlet } from 'react-router-dom'
import IntranetSidebar from './IntranetSidebar'
import IntranetTopbar from './IntranetTopbar'
import '../Portal.css'

function IntranetLayout() {
  return (
    <div className="portal-shell intranet-shell">
      <IntranetSidebar />

      <div className="portal-main">
        <IntranetTopbar />

        <main className="portal-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default IntranetLayout

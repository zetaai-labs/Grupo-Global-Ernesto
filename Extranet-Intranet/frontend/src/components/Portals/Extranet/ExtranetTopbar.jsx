
import { useLocation } from 'react-router-dom'

const pageNames = {
  overview: 'Overview',
  'shared-documents': 'Shared Documents',
  'my-submissions': 'My Submissions',
  'shared-links': 'Shared Links',
  'project-updates': 'Project Updates',
  resources: 'Resources'
}

function ExtranetTopbar() {
  const location = useLocation()
  const currentPage = location.pathname.split('/').filter(Boolean).pop()
  const title = pageNames[currentPage] || 'Overview'

  return (
    <header className="portal-topbar">
      <div className="topbar-breadcrumb">
        <span>Extranet</span>
        <span className="breadcrumb-divider">/</span>
        <strong>{title}</strong>
      </div>

      <div className="topbar-actions">
        <div className="topbar-search">
          <span>⌕</span>
          <input type="search" placeholder="Search shared workspace..." />
          <kbd>⌘ K</kbd>
        </div>

        <button className="topbar-icon-btn" title="Notifications">
          ♧
          <span className="notification-dot green-notification" />
        </button>

        <div className="topbar-divider" />

        <div className="topbar-profile">
          <div className="profile-avatar green-avatar">P</div>
          <div className="profile-copy">
            <strong>Partner User</strong>
            <span>External collaborator</span>
          </div>
          <span className="profile-chevron">⌄</span>
        </div>
      </div>
    </header>
  )
}

export default ExtranetTopbar

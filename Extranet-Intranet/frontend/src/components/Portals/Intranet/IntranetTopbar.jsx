
import { useLocation, useNavigate } from 'react-router-dom'

const pageNames = {
  overview: 'Overview',
  'cloud-folders': 'Cloud Folders',
  'linked-folder': 'Linked Folder',
  metalinks: 'MetaLinks',
  'web-received-files': 'Web Received Files',
  autoflow: 'AutoFlow',
  backups: 'Backups',
  'recycle-bin': 'Recycle Bin',
  emails: 'Emails',
  'external-shares': 'External Shares',
  'system-web-page': 'System Web Page',
  'user-management': 'User Management'
}

function IntranetTopbar() {
  const location = useLocation()
  const navigate = useNavigate()

  const currentPage = location.pathname.split('/').filter(Boolean).pop()
  const title = pageNames[currentPage] || 'Overview'

  return (
    <header className="portal-topbar">
      <div className="topbar-breadcrumb">
        <span>Intranet</span>
        <span className="breadcrumb-divider">/</span>
        <strong>{title}</strong>
      </div>

      <div className="topbar-actions">
        <div className="topbar-search">
          <span>⌕</span>
          <input type="search" placeholder="Search workspace..." />
          <kbd>⌘ K</kbd>
        </div>

        <button className="topbar-icon-btn" title="Notifications">
          ♧
          <span className="notification-dot" />
        </button>

        <div className="topbar-divider" />

        <button
          className="topbar-profile"
          onClick={() => navigate('/intranet/user-management')}
        >
          <div className="profile-avatar">U</div>
          <div className="profile-copy">
            <strong>Workspace User</strong>
            <span>Administrator</span>
          </div>
          <span className="profile-chevron">⌄</span>
        </button>
      </div>
    </header>
  )
}

export default IntranetTopbar

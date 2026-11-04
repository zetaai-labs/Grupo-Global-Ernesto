
import { NavLink, useNavigate } from 'react-router-dom'

const navigation = [
  {
    label: 'WORKSPACE',
    items: [
      { name: 'Overview', path: '/intranet/overview', icon: '⌂' }
    ]
  },
  {
    label: 'DOCUMENT MANAGEMENT',
    items: [
      { name: 'Cloud Folders', path: '/intranet/cloud-folders', icon: '▤' },
      { name: 'Linked Folder', path: '/intranet/linked-folder', icon: '⇄' },
      { name: 'MetaLinks', path: '/intranet/metalinks', icon: '↗' },
      { name: 'Web Received Files', path: '/intranet/web-received-files', icon: '⇩' },
      { name: 'Backups', path: '/intranet/backups', icon: '◷' },
      { name: 'Recycle Bin', path: '/intranet/recycle-bin', icon: '▧' }
    ]
  },
  {
    label: 'COLLABORATION',
    items: [
      { name: 'AutoFlow', path: '/intranet/autoflow', icon: '⟳' },
      { name: 'Emails', path: '/intranet/emails', icon: '✉' },
      { name: 'External Shares', path: '/intranet/external-shares', icon: '♧' }
    ]
  },
  {
    label: 'COMMUNICATION',
    items: [
      { name: 'Team Chat', path: '/intranet/chat', icon: '💬' },
      { name: 'Video Conferencing', path: '/intranet/video-conferencing', icon: '📹' }
    ]
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { name: 'System Web Page', path: '/intranet/system-web-page', icon: '▣' },
      { name: 'User Management', path: '/intranet/user-management', icon: '♙' }
    ]
  }
]

function IntranetSidebar() {
  const navigate = useNavigate()

  return (
    <aside className="portal-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">GG</div>
        <div>
          <h2>GLOBAL GROUP</h2>
          <span>INTERNAL WORKSPACE</span>
        </div>
      </div>

      <div className="sidebar-workspace-label">
        <span className="status-dot purple-dot" />
        INTRANET
      </div>

      <nav className="sidebar-navigation">
        {navigation.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{group.label}</p>

            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'active' : ''}`
                }
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                <span>{item.name}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-help">
          <div className="help-icon">?</div>
          <div>
            <strong>Need assistance?</strong>
            <span>Contact your administrator</span>
          </div>
        </div>

        <button
          className="switch-workspace"
          onClick={() => navigate('/extranet')}
        >
          <span>⇄</span> Switch to Extranet
        </button>

        <div className="sidebar-version">
          GLOBAL GROUP · WORKSPACE
        </div>
      </div>
    </aside>
  )
}

export default IntranetSidebar

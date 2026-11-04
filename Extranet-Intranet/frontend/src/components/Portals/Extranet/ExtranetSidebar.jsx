
import { NavLink, useNavigate } from 'react-router-dom'

const navigation = [
  {
    label: 'PARTNER WORKSPACE',
    items: [
      { name: 'Overview', path: '/extranet/overview', icon: '⌂' }
    ]
  },
  {
    label: 'DOCUMENTS',
    items: [
      { name: 'Shared Documents', path: '/extranet/shared-documents', icon: '▤' },
      { name: 'My Submissions', path: '/extranet/my-submissions', icon: '⇧' },
      { name: 'Shared Links', path: '/extranet/shared-links', icon: '↗' }
    ]
  },
  {
    label: 'INFORMATION',
    items: [
      { name: 'Project Updates', path: '/extranet/project-updates', icon: '◷' },
      { name: 'Resources', path: '/extranet/resources', icon: '▣' }
    ]
  },
  {
    label: 'COMMUNICATION',
    items: [
      { name: 'Partner Chat', path: '/extranet/chat', icon: '💬' },
      { name: 'Video Meetings', path: '/extranet/video-conferencing', icon: '📹' }
    ]
  }
]

function ExtranetSidebar() {
  const navigate = useNavigate()

  return (
    <aside className="portal-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">GG</div>
        <div>
          <h2>GLOBAL GROUP</h2>
          <span>PARTNER WORKSPACE</span>
        </div>
      </div>

      <div className="sidebar-workspace-label">
        <span className="status-dot green-dot" />
        EXTRANET
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
            <strong>Partner support</strong>
            <span>Get help with your workspace</span>
          </div>
        </div>

        <button
          className="switch-workspace"
          onClick={() => navigate('/intranet')}
        >
          <span>⇄</span> Switch to Intranet
        </button>

        <div className="sidebar-version">
          GLOBAL GROUP · WORKSPACE
        </div>
      </div>
    </aside>
  )
}

export default ExtranetSidebar

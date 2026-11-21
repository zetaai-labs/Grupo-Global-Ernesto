
import { NavLink } from 'react-router-dom'
import { getUser } from '../../../api/auth'
import { useT } from '../../../i18n'

const navigation = [
  {
    label: 'PARTNER WORKSPACE',
    items: [
      { name: 'Overview', path: '/extranet/overview', icon: '⌂' }
    ]
  },
  {
    label: 'CONFIDENTIAL',
    items: [
      { name: 'Investor Vault', path: '/extranet/investor-vault', icon: '🔒', roles: ['investor'] }
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
      { name: 'Team Chat', path: '/extranet/chat', icon: '💬' },
      { name: 'Video Meetings', path: '/extranet/video-conferencing', icon: '📹' }
    ]
  }
]

const WORKSPACE_LABELS = {
  partner: 'PARTNER WORKSPACE',
  client: 'CLIENT WORKSPACE',
  supplier: 'SUPPLIER WORKSPACE',
  investor: 'INVESTOR WORKSPACE',
}

function ExtranetSidebar() {
  const t = useT()
  const role = String(getUser()?.role || '').toLowerCase()
  const workspaceLabel = WORKSPACE_LABELS[role] || 'EXTERNAL WORKSPACE'
  const visibleNavigation = navigation
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(role)) }))
    .filter((group) => group.items.length)

  return (
    <aside className="portal-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">GG</div>
        <div>
          <h2>GLOBAL GROUP</h2>
          <span>{t(workspaceLabel)}</span>
        </div>
      </div>

      <div className="sidebar-workspace-label">
        <span className="status-dot green-dot" />
        {t('EXTRANET')}
      </div>

      <nav className="sidebar-navigation">
        {visibleNavigation.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{t(group.label)}</p>

            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'active' : ''}`
                }
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                <span>{t(item.name)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-help">
          <div className="help-icon">?</div>
          <div>
            <strong>{t('Support')}</strong>
            <span>{t('Get help with your workspace')}</span>
          </div>
        </div>

        <div className="sidebar-version">
          GLOBAL GROUP · WORKSPACE
        </div>
      </div>
    </aside>
  )
}

export default ExtranetSidebar


import { NavLink, useNavigate } from 'react-router-dom'
import { getUser } from '../../../api/auth'
import { useT } from '../../../i18n'

const navigation = [
  {
    label: 'WORKSPACE',
    items: [
      { name: 'Overview', path: '/intranet/overview', icon: '⌂' },
      { name: 'ZYLAX Suite', path: '/intranet/zylax', icon: '◆' },
      { name: 'Community', path: '/intranet/community', icon: '✦' }
    ]
  },
  {
    label: 'BUSINESS',
    items: [
      { name: 'Organizations & KYC', path: '/intranet/organizations', icon: '◈', roles: ['admin', 'tech_admin', 'hr', 'manager'] },
      { name: 'Business Directory', path: '/intranet/data-import', icon: '⇪', roles: ['admin', 'tech_admin', 'manager'] },
      { name: 'CRM Pipeline', path: '/intranet/crm', icon: '€' },
      { name: 'Commercial', path: '/intranet/commercial', icon: '▣', roles: ['admin', 'manager', 'employee', 'finance'] },
      { name: 'Projects & Programs', path: '/intranet/projects', icon: '▦' },
      { name: 'Investor Vault', path: '/intranet/investor-vault', icon: '🔒', roles: ['admin'] }
    ]
  },
  {
    label: 'DOCUMENT MANAGEMENT',
    items: [
      { name: 'Cloud Folders', path: '/intranet/cloud-folders', icon: '▤' },
      { name: 'Linked Folder', path: '/intranet/linked-folder', icon: '⇄' },
      { name: 'MetaLinks', path: '/intranet/metalinks', icon: '↗' },
      { name: 'Web Received Files', path: '/intranet/web-received-files', icon: '⇩' },
      { name: 'Backups', path: '/intranet/backups', icon: '◷', roles: ['admin', 'tech_admin'] },
      { name: 'Recycle Bin', path: '/intranet/recycle-bin', icon: '▧' }
    ]
  },
  {
    label: 'COLLABORATION',
    items: [
      { name: 'AutoFlow', path: '/intranet/autoflow', icon: '⟳' },
      { name: 'Calendar', path: '/intranet/calendar', icon: '◷' },
      { name: 'Emails', path: '/intranet/emails', icon: '✉' },
      { name: 'External Shares', path: '/intranet/external-shares', icon: '♧' },
      { name: 'Courses & Events', path: '/intranet/courses', icon: '🎓' }
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
      { name: 'Audit Log', path: '/intranet/audit-log', icon: '◷', roles: ['admin', 'tech_admin'] },
      { name: 'User Management', path: '/intranet/user-management', icon: '♙', roles: ['admin', 'tech_admin', 'hr'] },
      { name: 'Security (MFA)', path: '/intranet/security', icon: '✓' },
      { name: 'Privacy (GDPR)', path: '/intranet/privacy', icon: '⛨' },
      { name: 'Ethics & Compliance', path: '/intranet/ethics', icon: '⚖' }
    ]
  }
]

function IntranetSidebar() {
  const t = useT()
  const navigate = useNavigate()
  const user = getUser()
  const role = String(user?.role || '').toLowerCase()
  // Hide screens this role cannot use (the API enforces the same rules).
  const visibleNavigation = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length)

  return (
    <aside className="portal-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">GG</div>
        <div>
          <h2>GLOBAL GROUP</h2>
          <span>{t('INTERNAL WORKSPACE')}</span>
        </div>
      </div>

      <div className="sidebar-workspace-label">
        <span className="status-dot purple-dot" />
        {t('INTRANET')}
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
            <strong>{t('Need assistance?')}</strong>
            <span>{t('Contact your administrator')}</span>
          </div>
        </div>

        {user?.role === 'admin' && (
          <button
            className="switch-workspace"
            onClick={() => navigate('/extranet')}
          >
            <span>⇄</span> {t('Switch to Extranet')}
          </button>
        )}

        <div className="sidebar-version">
          GLOBAL GROUP · WORKSPACE
        </div>
      </div>
    </aside>
  )
}

export default IntranetSidebar

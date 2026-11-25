
import { NavLink } from 'react-router-dom'
import { getUser } from '../../../api/auth'
import { useT } from '../../../i18n'
import { visibleNavigation } from '../Shared/navigation'
import { openHelp } from '../Shared/help/helpEvents'


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
  const navigation = visibleNavigation('extranet', role)

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
        {navigation.map((group) => (
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
        <button type="button" className="sidebar-help" onClick={openHelp}>
          <div className="help-icon">?</div>
          <div>
            <strong>{t('Support')}</strong>
            <span>{t('Get help with your workspace')}</span>
          </div>
        </button>

        <div className="sidebar-version">
          GLOBAL GROUP · WORKSPACE
        </div>
      </div>
    </aside>
  )
}

export default ExtranetSidebar

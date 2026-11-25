
import { NavLink, useNavigate } from 'react-router-dom'
import { getUser } from '../../../api/auth'
import { useT } from '../../../i18n'
import { visibleNavigation } from '../Shared/navigation'
import { openHelp } from '../Shared/help/helpEvents'


function IntranetSidebar() {
  const t = useT()
  const navigate = useNavigate()
  const user = getUser()
  const role = String(user?.role || '').toLowerCase()
  // Hide screens this role cannot use (the API enforces the same rules).
  const navigation = visibleNavigation('intranet', role)

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
            <strong>{t('Need assistance?')}</strong>
            <span>{t('Help & support')}</span>
          </div>
        </button>

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

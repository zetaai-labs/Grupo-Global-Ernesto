import { Link } from 'react-router-dom'
import { PORTAL_ROLES, getUser } from '../../../../../api/auth'
import RoleConsole from './RoleConsole'
import PresidentialHome from './PresidentialHome'
import ClockCard from '../../../Shared/clock/ClockCard'
import './Overview.css'
import { useT } from '../../../../../i18n'
import { visibleScreens } from '../../../Shared/navigation'

function Overview() {
  const user = getUser()
  // The Super Admin gets the Presidential Master Console; every other role keeps its workspace view.
  if (user?.role === 'admin') return <PresidentialHome name={user.name} />
  return <RoleOverview user={user} />
}

// Each role's most used screens (Schema Document §3 consoles).
const SHORTCUTS = {
  hr: ['/intranet/user-management', '/intranet/zylax', '/intranet/ethics', '/intranet/courses'],
  finance: ['/intranet/billing', '/intranet/commercial', '/intranet/zylax', '/intranet/projects'],
  tech_admin: ['/intranet/backups', '/intranet/audit-log', '/intranet/system', '/intranet/user-management'],
  default: ['/intranet/cloud-folders', '/intranet/autoflow', '/intranet/projects', '/intranet/chat'],
}

function RoleOverview({ user }) {
  const t = useT()
  const screens = visibleScreens('intranet', user?.role)
  const shortcuts = (SHORTCUTS[user?.role] || SHORTCUTS.default)
    .map((path) => screens.find((item) => item.path === path))
    .filter(Boolean)

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('WORKSPACE')}</div>
          <h1>{t('Welcome, {name}', { name: (user?.name || '').split(' ')[0] })}</h1>
          <p>{t('Here is your workspace at a glance.')}</p>
        </div>
      </div>

      {PORTAL_ROLES.intranet.includes(user?.role) && <ClockCard showLeave />}

      <RoleConsole />

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t('Quick access')}</h3>
            <p>{t('Jump into the most used areas of the intranet.')}</p>
          </div>
        </div>
        <div className="overview-links">
          {shortcuts.map((item) => <Link key={item.path} to={item.path}>{item.icon} {t(item.name)}</Link>)}
        </div>
      </div>
    </section>
  )
}

export default Overview

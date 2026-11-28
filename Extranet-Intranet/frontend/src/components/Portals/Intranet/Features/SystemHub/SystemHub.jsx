import { Link } from 'react-router-dom'
import { getUser } from '../../../../../api/auth'
import { visibleScreens } from '../../../Shared/navigation'
import { useT } from '../../../../../i18n'
import './SystemHub.css'

// Technical settings the Super Admin rarely opens, kept off the sidebar so it stays short.
const SYSTEM_PATHS = [
  '/intranet/integrations',
  '/intranet/accounts',
  '/intranet/assistant-knowledge',
]

function SystemHub() {
  const t = useT()
  const screens = visibleScreens('intranet', getUser()?.role)
  const tiles = SYSTEM_PATHS.map((path) => screens.find((item) => item.path === path)).filter(Boolean)

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('ADMINISTRATION')}</div>
          <h1>{t('System settings')}</h1>
          <p>{t('Integrations, company email accounts and the AI assistant.')}</p>
        </div>
      </div>
      <div className="system-hub-grid">
        {tiles.map((item) => (
          <Link key={item.path} to={item.path} className="system-hub-tile">
            <span className="system-hub-icon" aria-hidden="true">{item.icon}</span>
            <strong>{t(item.name)}</strong>
            <small>{t(item.description)}</small>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default SystemHub

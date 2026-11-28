import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../../../../api/client'
import { useT, dateLocale } from '../../../../../i18n'
import './PresidentialHome.css'

const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(value || 0))
const readable = (action) => {
  const text = String(action || '').replace(/^ZX_/, '').toLowerCase().replaceAll('_', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const QUICK_ACTIONS = [
  { label: 'Add a user', path: '/intranet/user-management', icon: '♙' },
  { label: 'Approve companies', path: '/intranet/organizations', icon: '◈' },
  { label: 'Upload a document', path: '/intranet/cloud-folders', icon: '▤' },
  { label: 'Post an announcement', path: '/intranet/system-web-page', icon: '▣' },
]

/**
 * Presidential Master Console (Schema Document §3): the Super Admin's home page.
 * One screen: what needs a decision, the key numbers, and the latest activity.
 */
function PresidentialHome({ name }) {
  const t = useT()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  const load = () => {
    setFailed(false)
    api.get('/dashboard/console')
      .then((response) => setData(response.data?.data || null))
      .catch((error) => { if (error.response?.data?.code !== 'MFA_SETUP_REQUIRED') setFailed(true) })
  }
  useEffect(load, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning, {name}' : hour < 19 ? 'Good afternoon, {name}' : 'Good evening, {name}'
  const today = new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <section className="feature-page presidential">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('Presidential Master Console')}</div>
          <h1>{t(greeting, { name: (name || '').split(' ')[0] })}</h1>
          <p className="ph-date">{today}</p>
        </div>
      </div>

      {failed && (
        <div className="cloud-notice ph-retry">
          {t('The server is waking up. This can take up to a minute.')}
          <button type="button" className="secondary-action" onClick={load}>{t('Try again')}</button>
        </div>
      )}

      <div className="ph-layout">
        <div className="feature-panel ph-attention">
          <div className="panel-heading"><div><h3>{t('Needs your attention')}</h3></div></div>
          {!data && !failed && <p className="ph-muted">{t('Loading…')}</p>}
          {data && !data.attention?.length && <p className="ph-clear">✓ {t('All clear. Nothing is waiting for you.')}</p>}
          <ul>
            {data?.attention?.map((item) => (
              <li key={item.key} className={item.alert ? 'is-alert' : ''}>
                <strong>{item.count}</strong>
                <span>{t(item.label)}</span>
                <Link to={item.link} className="secondary-action">{t(item.action)}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="feature-panel ph-actions">
          <div className="panel-heading"><div><h3>{t('Quick actions')}</h3></div></div>
          <div className="ph-action-grid">
            {QUICK_ACTIONS.map((action) => (
              <Link key={action.path} to={action.path}><span aria-hidden="true">{action.icon}</span>{t(action.label)}</Link>
            ))}
          </div>
        </div>
      </div>

      <div className="ph-cards">
        {(data?.cards || []).map((card) => (
          <Link key={card.label} to={card.link} className="stat-card ph-card">
            <span>{t(card.label)}</span>
            <strong>{card.format === 'eur' ? euro(card.value) : card.value}</strong>
            <small>{t(card.note, card.noteValues)}</small>
          </Link>
        ))}
      </div>

      <div className="feature-panel">
        <div className="panel-heading">
          <div><h3>{t('Recent activity')}</h3></div>
          <Link to="/intranet/audit-log" className="ph-link">{t('Full audit log')} →</Link>
        </div>
        {data && !data.recent?.length && <p className="ph-muted">{t('No activity yet.')}</p>}
        <ul className="ph-recent">
          {data?.recent?.map((entry) => (
            <li key={entry.id}>
              <span>{t(readable(entry.action))}</span>
              <em>{entry.user_name || t('System')}</em>
              <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default PresidentialHome

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import RoleConsole from './RoleConsole'
import './Overview.css'
import { useT } from '../../../../../i18n'

function Overview() {
  const t = useT()
  const user = getUser()
  const [stats, setStats] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api.get('/dashboard')
      .then((response) => setStats(response.data?.data || {}))
      .catch(() => setNotice('Could not load dashboard counts.'))
  }, [])

  const cards = [
    { label: 'Total users', value: stats?.users, note: 'Active accounts', show: user?.role === 'admin' },
    { label: 'Folders', value: stats?.folders, note: 'In your region' },
    { label: 'Files', value: stats?.files, note: 'Available documents' },
    { label: 'Pending approvals', value: stats?.pendingApprovals, note: 'AutoFlow requests' },
    { label: 'Workflows', value: stats?.workflows, note: 'Tracked processes' },
    { label: 'Emails', value: stats?.emails, note: 'Recorded messages' },
  ].filter((card) => card.show !== false)

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('WORKSPACE')}</div>
          <h1>{t('Overview')}</h1>
          <p>
            {user?.name
              ? t('Welcome back, {name}. Here is your workspace at a glance.', { name: user.name })
              : t('Welcome back. Here is your workspace at a glance.')}
          </p>
        </div>
      </div>

      {notice && <div className="cloud-notice">{notice}</div>}

      <RoleConsole />

      <div className="feature-stats">
        {cards.map((card) => (
          <div className="stat-card" key={card.label}>
            <div className="stat-top"><span>{t(card.label)}</span><span className="stat-icon">▤</span></div>
            <strong>{stats ? (card.value ?? 0) : '…'}</strong>
            <small>{t(card.note)}</small>
          </div>
        ))}
      </div>

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t('Quick access')}</h3>
            <p>{t('Jump into the most used areas of the intranet.')}</p>
          </div>
        </div>
        <div className="overview-links">
          <Link to="/intranet/cloud-folders">▤ Cloud Folders</Link>
          <Link to="/intranet/autoflow">⟳ AutoFlow</Link>
          <Link to="/intranet/metalinks">↗ MetaLinks</Link>
          <Link to="/intranet/recycle-bin">▧ Recycle Bin</Link>
        </div>
      </div>
    </section>
  )
}

export default Overview

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../../../../api/client'
import { useT } from '../../../../../i18n'

const SHORTCUTS = [
  { name: 'Shared Documents', description: 'Access documents shared with you', icon: '▤', path: '/extranet/shared-documents' },
  { name: 'My Submissions', description: 'Review files you have submitted', icon: '⇧', path: '/extranet/my-submissions' },
  { name: 'Shared Links', description: 'Links shared with you.', icon: '↗', path: '/extranet/shared-links' },
  { name: 'Project Updates', description: 'Stay informed about project activity', icon: '◷', path: '/extranet/project-updates' },
]

/** Partner home: real counts of what is shared with the organisation, and shortcuts to each area. */
function Overview() {
  const t = useT()
  // null = still loading; '—' = could not be counted (no access or offline).
  const [counts, setCounts] = useState({ documents: null, submissions: null, links: null })

  useEffect(() => {
    let alive = true
    const count = (request, pick) => request.then((response) => pick(response.data?.data)).catch(() => '—')
    Promise.all([
      count(api.get('/external-shares/shared-with-me'), (data) => (data?.files?.length || 0) + (data?.folders?.length || 0)),
      count(api.get('/content/my-submissions'), (data) => (Array.isArray(data) ? data.length : 0)),
      count(api.get('/external-shares/shared-links'), (data) => (Array.isArray(data) ? data.length : 0)),
    ]).then(([documents, submissions, links]) => { if (alive) setCounts({ documents, submissions, links }) })
    return () => { alive = false }
  }, [])

  const stats = [
    { key: 'documents', label: 'Shared documents', note: 'Available to you', icon: '▤', path: '/extranet/shared-documents' },
    { key: 'submissions', label: 'My submissions', note: 'Uploaded documents', icon: '⇧', path: '/extranet/my-submissions' },
    { key: 'links', label: 'Shared links', note: 'Accessible links', icon: '↗', path: '/extranet/shared-links' },
  ]

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('PARTNER WORKSPACE')}</div>
          <h1>{t('Overview')}</h1>
          <p>{t('Your secure workspace for accessing shared documents and collaborating with Global Group.')}</p>
        </div>
        <Link className="primary-action" to="/extranet/shared-documents">{t('Browse documents')}</Link>
      </div>

      <div className="feature-stats">
        {stats.map((stat) => (
          <Link className="stat-card" key={stat.key} to={stat.path} style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="stat-top">
              <span>{t(stat.label)}</span>
              <span className="stat-icon">{stat.icon}</span>
            </div>
            <strong aria-busy={counts[stat.key] === null}>{counts[stat.key] ?? '…'}</strong>
            <small>{t(stat.note)}</small>
          </Link>
        ))}
      </div>

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t('Quick access')}</h3>
            <p>{t('Manage and access everything in {area}.', { area: t('Overview') })}</p>
          </div>
          <Link className="secondary-action" to="/extranet/workspace">{t('View all ↗')}</Link>
        </div>
        <div className="feature-list">
          {SHORTCUTS.map((item) => (
            <Link className="feature-list-row" key={item.path} to={item.path} style={{ color: 'inherit', textDecoration: 'none' }}>
              <div className="list-item-icon">{item.icon}</div>
              <div className="list-item-copy">
                <strong>{t(item.name)}</strong>
                <span>{t(item.description)}</span>
              </div>
              <span className="list-item-arrow">↗</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Overview

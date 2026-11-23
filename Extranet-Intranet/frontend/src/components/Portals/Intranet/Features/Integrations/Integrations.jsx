import { useEffect, useMemo, useState } from 'react'
import api from '../../../../../api/client'
import { useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import './Integrations.css'

const STATUS = {
  CONFIGURED: ['Keys added', 'ig-good'],
  PARTIAL: ['Incomplete', 'ig-warn'],
  NOT_SET: ['Waiting for keys', 'ig-off'],
  NOT_BUILT: ['Not built yet', 'ig-todo'],
}
const GROUPS = ['Security', 'Infrastructure', 'Communication', 'Payments', 'Identity & accounts', 'Compliance', 'AI']
const FILTERS = [['all', 'All'], ['launch', 'Needed for launch'], ['action', 'Needs action']]

function Integrations() {
  const t = useT()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('launch')

  useEffect(() => {
    api.get('/integrations')
      .then((response) => setReport(response.data.data))
      .catch((failure) => setError(failure.response?.data?.message || 'Could not load this page.'))
  }, [])

  const groups = useMemo(() => {
    const visible = (report?.items || []).filter((item) => {
      if (filter === 'launch') return item.launch
      if (filter === 'action') return item.status !== 'CONFIGURED'
      return true
    })
    return GROUPS.map((group) => [group, visible.filter((item) => item.group === group)]).filter(([, items]) => items.length)
  }, [report, filter])

  const summary = report?.summary

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('ADMINISTRATION')}</div>
          <h1>{t('Integrations')}</h1>
          <p>{t('See which outside services are ready and what is still needed. Secret values are never shown.')}</p>
        </div>
      </div>

      {error && <div className="cloud-notice" role="alert">{translateServer(error)}</div>}
      {!report && !error && <p className="ig-empty">{t('Loading...')}</p>}

      {summary && (
        <>
          <div className="feature-stats">
            <div className="stat-card"><div className="stat-top"><span>{t('Launch items open')}</span><span className="stat-icon">!</span></div><strong>{summary.launch_blockers}</strong><small>{t('Must be ready before go-live')}</small></div>
            <div className="stat-card"><div className="stat-top"><span>{t('Keys added')}</span><span className="stat-icon">✓</span></div><strong>{summary.configured}</strong><small>{t('of {count} integrations', { count: summary.total })}</small></div>
            <div className="stat-card"><div className="stat-top"><span>{t('Waiting for keys')}</span><span className="stat-icon">◷</span></div><strong>{summary.not_set + summary.partial}</strong><small>{t('Code is ready')}</small></div>
            <div className="stat-card"><div className="stat-top"><span>{t('Not built yet')}</span><span className="stat-icon">▦</span></div><strong>{summary.not_built}</strong><small>{t('Development still needed')}</small></div>
          </div>

          <p className="ig-note">{t('"Keys added" means the settings exist. Each service still needs a live test with the real account.')}</p>

          <div className="ig-filters" role="group" aria-label={t('Filter integrations')}>
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{t(label)}</button>
            ))}
          </div>

          {groups.map(([group, items]) => (
            <div key={group} className="ig-group">
              <h2>{t(group)}</h2>
              <div className="ig-grid">
                {items.map((item) => {
                  const [label, tone] = STATUS[item.status]
                  const missing = item.settings.filter((setting) => !setting.present)
                  return (
                    <article key={item.key} className="ig-card">
                      <header>
                        <strong>{t(item.name)}</strong>
                        <span className={`ig-pill ${tone}`}>{t(label)}</span>
                      </header>
                      {item.launch && <small className="ig-launch">{t('Needed for launch')}</small>}
                      {item.when_off && <p>{t(item.when_off)}</p>}
                      {item.needs && <p>{t('Needs')}: {t(item.needs)}</p>}
                      {missing.length > 0 && (
                        <div className="ig-settings">
                          <small>{t('Missing settings')}</small>
                          <div>{missing.map((setting) => <code key={setting.name}>{setting.name}</code>)}</div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

export default Integrations

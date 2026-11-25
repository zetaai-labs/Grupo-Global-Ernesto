import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { dateLocale, useT } from '../../../../../i18n'
import './SystemHealth.css'

const REFRESH_MS = 30000
const STATUS = { ok: ['All systems working', 'sh-ok'], degraded: ['Needs attention', 'sh-warn'], down: ['Service problem', 'sh-bad'] }
const PROBLEMS = {
  database: 'The database is not answering.',
  disk: 'Storage is almost full (less than 10% free).',
  backups: 'No successful backup in the expected time.',
  errors: 'More than 5% of requests failed in the last 15 minutes.',
  jobs: 'A scheduled job is failing.',
}

const gb = (bytes) => `${(bytes / 1073741824).toFixed(1)} GB`
function since(seconds, t) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d ? t('{d} d {h} h', { d, h }) : t('{h} h {m} min', { h, m: String(m).padStart(2, '0') })
}

/** Live server health for system administrators (GET /api/monitoring, refreshed every 30 seconds). */
function SystemHealth() {
  const t = useT()
  const [health, setHealth] = useState(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => api.get('/monitoring')
    .then((response) => { setHealth(response.data.data); setFailed(false) })
    .catch(() => setFailed(true)), [])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  if (failed && !health) return <div className="cloud-notice" role="alert">{t('The server did not answer the health check.')}</div>
  if (!health) return null
  const when = (iso) => (iso ? new Date(iso).toLocaleString(dateLocale()) : '—')
  const [label, tone] = STATUS[health.status] || STATUS.degraded

  return (
    <section className={`feature-panel sh-panel ${tone}`} aria-label={t('System health')}>
      <header className="sh-head">
        <div>
          <h2>{t('System health')}</h2>
          <p>{t('Updated every 30 seconds. Administrators get an alert when a scheduled job fails.')}</p>
        </div>
        <span className={`sh-badge ${tone}`}>{t(label)}</span>
      </header>
      {failed && <small className="sh-stale">{t('Showing the last answer: the server did not respond just now.')}</small>}
      {health.problems.length > 0 && <ul className="sh-problems">{health.problems.map((key) => <li key={key}>{t(PROBLEMS[key] || key)}</li>)}</ul>}

      <div className="sh-grid">
        <div><span>{t('Database')}</span><b className={health.database.ok ? 'sh-ok' : 'sh-bad'}>{health.database.ok ? t('{ms} ms', { ms: health.database.ms }) : t('Not answering')}</b></div>
        <div><span>{t('Requests (15 min)')}</span><b>{health.requests.requests}</b><small>{t('{rate}% errors · p95 {ms} ms', { rate: health.requests.error_rate, ms: health.requests.p95_ms })}</small></div>
        <div><span>{t('Storage free')}</span><b className={health.disk.ok === false ? 'sh-bad' : ''}>{health.disk.free_bytes ? `${health.disk.free_percent}%` : '—'}</b>{health.disk.free_bytes ? <small>{gb(health.disk.free_bytes)} / {gb(health.disk.total_bytes)}</small> : null}</div>
        <div><span>{t('Last backup')}</span><b className={health.backups.ok === false ? 'sh-bad' : ''}>{when(health.backups.last_backup)}</b></div>
        <div><span>{t('Running for')}</span><b>{since(health.uptime_seconds, t)}</b><small>{t('Memory {mb} MB', { mb: health.memory_mb.rss })}</small></div>
        <div><span>{t('Error reports')}</span><b>{health.error_reporting === 'sentry' ? 'Sentry' : t('Server logs only')}</b></div>
      </div>

      <details className="sh-section">
        <summary>{t('Scheduled jobs ({count})', { count: health.jobs.length })}</summary>
        <div className="sh-table-wrap">
          <table>
            <thead><tr><th>{t('Job')}</th><th>{t('Last success')}</th><th>{t('Last failure')}</th><th>{t('Runs')}</th></tr></thead>
            <tbody>
              {health.jobs.map((job) => {
                const failing = job.last_failed && (!job.last_ok || job.last_failed > job.last_ok)
                return (
                  <tr key={job.name} className={failing ? 'sh-row-bad' : ''}>
                    <td>{t(job.name)}</td>
                    <td>{when(job.last_ok)}</td>
                    <td>{job.last_failed ? <>{when(job.last_failed)}<small>{job.last_error}</small></> : '—'}</td>
                    <td>{job.runs}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>

      {health.recent_errors.length > 0 && (
        <details className="sh-section">
          <summary>{t('Recent server errors ({count})', { count: health.recent_errors.length })}</summary>
          <ul className="sh-errors">
            {health.recent_errors.map((item) => (
              <li key={`${item.time}-${item.request_id || item.job}`}>
                <time>{when(item.time)}</time>
                <code>{item.request_id || item.job || item.kind}</code>
                <span>{item.method ? `${item.method} ${item.path} · ` : ''}{item.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

export default SystemHealth

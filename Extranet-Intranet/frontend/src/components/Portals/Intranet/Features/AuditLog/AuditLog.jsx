import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { downloadFromApi } from '../../../../../utils/download'
import { translateServer } from '../../../../../i18n/serverMessages'
import './AuditLog.css'
import { useT, dateLocale } from '../../../../../i18n'

// Areas of activity (the server groups actions by their first word, so new features fall into place).
const AREAS = [
  ['', 'All activity'], ['sign_in', 'Sign-in & security'], ['users', 'Users & access'], ['privacy', 'Privacy (GDPR)'],
  ['compliance', 'Compliance & KYC'], ['money', 'Billing & membership'], ['business', 'Business modules'],
  ['documents', 'Documents & files'], ['vault', 'Investor Vault'], ['ai', 'AI & assistant'], ['system', 'System'],
]
const EMPTY = { q: '', area: '', only: '', from: '', to: '' }
const PROBLEM = /(FAIL|REJECT|DENIED|BLOCKED|INVALID|MISMATCH|DUPLICATE|LOCKED|SUSPEND|WITHDRAWN|EXPELLED)/
/** Local date `days` ago as YYYY-MM-DD, so a summary card opens the same period it counts. */
const daysAgo = (days) => {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** LOGIN_FAILED → "Login failed": readable, while the exact code stays visible underneath. */
const readable = (action) => {
  const text = action.toLowerCase().replaceAll('_', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const params = (filters, extra = {}) => {
  const out = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...filters, ...extra })) if (value) out.set(key, value)
  return out.toString()
}

/** Every operation on the platform, for the administrators: search, filter, open the details, export. */
function AuditLog() {
  const t = useT()
  const [entries, setEntries] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [summary, setSummary] = useState(null)
  const [filters, setFilters] = useState(EMPTY)
  const [applied, setApplied] = useState(EMPTY)
  const [open, setOpen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [integrity, setIntegrity] = useState(null)
  const [checking, setChecking] = useState(false)

  const load = useCallback(async (more = false, from = []) => {
    setLoading(true)
    try {
      const before = more && from.length ? from[from.length - 1].id : ''
      const response = await api.get(`/audit-logs?${params(applied, { before })}`)
      const rows = response.data?.data || []
      setEntries(more ? [...from, ...rows] : rows)
      setHasMore(Boolean(response.data?.has_more))
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message) || t('Could not load the audit log.'))
    } finally {
      setLoading(false)
    }
  }, [applied, t])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get('/audit-logs/summary').then((response) => setSummary(response.data.data)).catch(() => {})
  }, [])

  const apply = (event) => {
    event?.preventDefault()
    setOpen(null)
    setApplied({ ...filters })
  }
  const quick = (patch) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    setOpen(null)
    setApplied(next)
  }

  const verify = async () => {
    setChecking(true)
    setNotice('')
    try {
      const response = await api.get('/audit-logs/integrity')
      setIntegrity(response.data.data)
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message) || t('Could not verify the audit log.'))
    } finally {
      setChecking(false)
    }
  }

  const copyToStorage = async () => {
    setChecking(true)
    try {
      const response = await api.post('/audit-logs/anchors')
      setNotice(translateServer(response.data?.message) || '')
      const refreshed = await api.get('/audit-logs/integrity')
      setIntegrity(refreshed.data.data)
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message) || t('Could not copy the audit log.'))
    } finally {
      setChecking(false)
    }
  }

  const exportCsv = () => downloadFromApi(`/audit-logs/export.csv?${params(applied)}`, 'audit-log.csv')
    .catch(() => setNotice(t('The download could not be prepared.')))

  const filtered = Object.values(applied).some(Boolean)

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('ADMINISTRATION')}</div>
          <h1>{t('Audit Log')}</h1>
          <p>{t('Every operation on the platform: who did what, and when. Search, filter by area or person, open the details and export.')}</p>
        </div>
        <button type="button" className="primary-action" onClick={exportCsv}>⇩ {t('Export CSV')}</button>
      </div>

      {summary && (
        <div className="feature-stats">
          <button type="button" className="stat-card audit-stat" onClick={() => quick({ ...EMPTY, from: daysAgo(0) })}>
            <div className="stat-top"><span>{t('Events today')}</span><span className="stat-icon">◷</span></div>
            <strong>{summary.today.toLocaleString(dateLocale())}</strong>
            <small>{t('{count} in total', { count: summary.total.toLocaleString(dateLocale()) })}</small>
          </button>
          <div className="stat-card">
            <div className="stat-top"><span>{t('Active people today')}</span><span className="stat-icon">♙</span></div>
            <strong>{summary.active_users_today}</strong>
            <small>{t('People who did something today')}</small>
          </div>
          <button type="button" className={`stat-card audit-stat ${summary.failed_sign_ins_24h ? 'audit-warn' : ''}`} onClick={() => quick({ area: 'sign_in', only: 'problems', from: daysAgo(1), to: '' })}>
            <div className="stat-top"><span>{t('Failed sign-ins (24 h)')}</span><span className="stat-icon">!</span></div>
            <strong>{summary.failed_sign_ins_24h}</strong>
            <small>{t('Click to see them')}</small>
          </button>
          <button type="button" className={`stat-card audit-stat ${summary.problems_7d ? 'audit-warn' : ''}`} onClick={() => quick({ area: '', only: 'problems', from: daysAgo(7), to: '' })}>
            <div className="stat-top"><span>{t('Problems (7 days)')}</span><span className="stat-icon">⚠</span></div>
            <strong>{summary.problems_7d}</strong>
            <small>{t('Refused, failed or suspended actions')}</small>
          </button>
        </div>
      )}

      {notice && <div className="cloud-notice" role="status"><span>{notice}</span></div>}

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t('Log integrity')}</h3>
            <p>{t('Checks that no audit entry has been changed, removed or reordered.')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="primary-action" disabled={checking} onClick={verify}>{checking ? t('Checking…') : t('Verify integrity')}</button>
            {integrity?.immutable_storage.configured && integrity.valid && (
              <button type="button" className="secondary-action" disabled={checking} onClick={copyToStorage}>{t('Copy to immutable storage')}</button>
            )}
          </div>
        </div>
        {integrity && (
          <div className="cloud-notice" role={integrity.valid ? 'status' : 'alert'}>
            <strong>{integrity.valid ? t('Verified: no tampering detected.') : t('Integrity check failed.')}</strong>{' '}
            {integrity.valid
              ? `${integrity.entries.toLocaleString(dateLocale())} ${t('entries checked')}.`
              : `${integrity.issue.type}${integrity.issue.seq ? ` · ${t('entry')} ${integrity.issue.seq}` : ''}`}{' '}
            {integrity.immutable_storage.configured
              ? `${t('Immutable copy up to entry')} ${integrity.anchored_to_seq.toLocaleString(dateLocale())} (${integrity.immutable_storage.mode}).`
              : t('Immutable storage is not configured yet.')}
          </div>
        )}
      </div>

      <div className="feature-panel">
        <form className="audit-filters" onSubmit={apply}>
          <input type="search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder={t('Search action, person, email or record…')} aria-label={t('Search')} />
          <select value={filters.area} onChange={(e) => quick({ area: e.target.value })} aria-label={t('Area')}>
            {AREAS.map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
          </select>
          <label>{t('From')}<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
          <label>{t('To')}<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
          <label className="audit-check"><input type="checkbox" checked={filters.only === 'problems'} onChange={(e) => quick({ only: e.target.checked ? 'problems' : '' })} /> {t('Only problems')}</label>
          <button type="submit" className="primary-action">{t('Search')}</button>
          {filtered && <button type="button" className="secondary-action" onClick={() => { setFilters(EMPTY); setOpen(null); setApplied(EMPTY) }}>{t('Clear')}</button>}
        </form>

        {entries.length ? (
          <div className="audit-table">
            <div className="audit-row audit-head">
              <span>{t('Action')}</span><span>{t('User')}</span><span>{t('Entity')}</span><span>{t('When')}</span>
            </div>
            {entries.map((entry) => (
              <div key={entry.id}>
                <button type="button" className={`audit-row audit-line ${PROBLEM.test(entry.action) ? 'audit-problem' : ''}`} aria-expanded={open === entry.id} onClick={() => setOpen(open === entry.id ? null : entry.id)}>
                  <span><strong>{readable(entry.action)}</strong><code>{entry.action}</code></span>
                  <span>
                    {entry.user_id
                      ? <a href="#user" onClick={(e) => { e.preventDefault(); e.stopPropagation(); quick({ q: entry.user_email || '' }) }} title={t('Show everything this person did')}>{entry.user_name || entry.user_email}</a>
                      : t('System')}
                    {entry.user_role && <small> · {t(entry.user_role)}</small>}
                  </span>
                  <span>{entry.entity || '—'}{entry.entity_id ? <small> #{String(entry.entity_id).slice(0, 12)}</small> : ''}</span>
                  <span>{new Date(entry.created_at).toLocaleString(dateLocale())}</span>
                </button>
                {open === entry.id && (
                  <dl className="audit-details">
                    <div><dt>{t('Entry')}</dt><dd>#{entry.id}</dd></div>
                    {entry.user_email && <div><dt>{t('Email')}</dt><dd>{entry.user_email}</dd></div>}
                    {entry.entity_id && <div><dt>{t('Record')}</dt><dd>{entry.entity} #{entry.entity_id}</dd></div>}
                    {Object.entries(entry.details || {}).map(([key, value]) => (
                      <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>
                    ))}
                    {!Object.keys(entry.details || {}).length && <div><dt>{t('Details')}</dt><dd>—</dd></div>}
                  </dl>
                )}
              </div>
            ))}
            {hasMore && (
              <button type="button" className="secondary-action audit-more" disabled={loading} onClick={() => load(true, entries)}>{loading ? t('Loading…') : t('Load older entries')}</button>
            )}
          </div>
        ) : loading ? (
          <p className="cloud-empty">{t('Loading…')}</p>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">◷</div>
            <h3>{t(filtered ? 'Nothing matches these filters' : 'No activity recorded')}</h3>
            <p>{t(filtered ? 'Change the search or the dates.' : 'Actions will appear here as users work in the platform.')}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default AuditLog

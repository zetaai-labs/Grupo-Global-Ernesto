import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './AuditLog.css'
import { useT } from '../../../../../i18n'

function AuditLog() {
  const t = useT()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get('/audit-logs')
      setEntries(response.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load the audit log.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('ADMINISTRATION')}</div>
          <h1>{t('Audit Log')}</h1>
          <p>{t('Trace security-relevant activity across the platform.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>Total events</span><span className="stat-icon">◷</span></div>
          <strong>{entries.length}</strong>
          <small>Most recent 100 events</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Logins</span><span className="stat-icon">✓</span></div>
          <strong>{entries.filter((entry) => entry.action.startsWith('LOGIN')).length}</strong>
          <small>Successful and failed</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Document events</span><span className="stat-icon">▤</span></div>
          <strong>{entries.filter((entry) => ['FILE', 'FOLDER', 'ITEM'].some((p) => entry.action.startsWith(p))).length}</strong>
          <small>Files and folders</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{notice}</div>}

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>Recent activity</h3>
            <p>Newest events appear first.</p>
          </div>
        </div>

        {loading ? (
          <p className="cloud-empty">Loading…</p>
        ) : entries.length ? (
          <div className="audit-table">
            <div className="audit-row audit-head">
              <span>Action</span><span>User</span><span>Entity</span><span>When</span>
            </div>
            {entries.map((entry) => (
              <div className="audit-row" key={entry.id}>
                <span><strong>{entry.action}</strong></span>
                <span>{entry.user_name || `${entry.user_email || 'System'}`}</span>
                <span>{entry.entity}{entry.entity_id ? ` #${entry.entity_id}` : ''}</span>
                <span>{new Date(entry.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">◷</div>
            <h3>No activity recorded</h3>
            <p>Actions will appear here as users work in the platform.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default AuditLog

import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './AuditLog.css'
import { useT, dateLocale } from '../../../../../i18n'

function AuditLog() {
  const t = useT()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [integrity, setIntegrity] = useState(null)
  const [checking, setChecking] = useState(false)

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

  const verify = async () => {
    setChecking(true)
    setNotice('')
    try {
      const response = await api.get('/audit-logs/integrity')
      setIntegrity(response.data.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not verify the audit log.')
    } finally {
      setChecking(false)
    }
  }

  const copyToStorage = async () => {
    setChecking(true)
    try {
      const response = await api.post('/audit-logs/anchors')
      setNotice(response.data?.message || '')
      const refreshed = await api.get('/audit-logs/integrity')
      setIntegrity(refreshed.data.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not copy the audit log.')
    } finally {
      setChecking(false)
    }
  }

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
          <div className="stat-top"><span>{t("Total events")}</span><span className="stat-icon">◷</span></div>
          <strong>{entries.length}</strong>
          <small>{t("Most recent 100 events")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Logins")}</span><span className="stat-icon">✓</span></div>
          <strong>{entries.filter((entry) => entry.action.startsWith('LOGIN')).length}</strong>
          <small>{t("Successful and failed")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Document events")}</span><span className="stat-icon">▤</span></div>
          <strong>{entries.filter((entry) => ['FILE', 'FOLDER', 'ITEM'].some((p) => entry.action.startsWith(p))).length}</strong>
          <small>{t("Files and folders")}</small>
        </div>
      </div>

      {notice && <div className="cloud-notice" role="status">{t(notice)}</div>}

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
        <div className="panel-heading">
          <div>
            <h3>{t("Recent activity")}</h3>
            <p>{t("Newest events appear first.")}</p>
          </div>
        </div>

        {loading ? (
          <p className="cloud-empty">{t("Loading…")}</p>
        ) : entries.length ? (
          <div className="audit-table">
            <div className="audit-row audit-head">
              <span>{t("Action")}</span><span>{t("User")}</span><span>{t("Entity")}</span><span>{t("When")}</span>
            </div>
            {entries.map((entry) => (
              <div className="audit-row" key={entry.id}>
                <span><strong>{entry.action}</strong></span>
                <span>{entry.user_name || `${entry.user_email || 'System'}`}</span>
                <span>{entry.entity}{entry.entity_id ? ` #${entry.entity_id}` : ''}</span>
                <span>{new Date(entry.created_at).toLocaleString(dateLocale())}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">◷</div>
            <h3>{t("No activity recorded")}</h3>
            <p>{t("Actions will appear here as users work in the platform.")}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default AuditLog

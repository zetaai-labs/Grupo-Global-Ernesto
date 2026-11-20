import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './Backups.css'
import { useT } from '../../../../../i18n'

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`
}

function Backups() {
  const t = useT()
  const [backups, setBackups] = useState([])
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await api.get('/backups')
      setBackups(response.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load backups.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async (type) => {
    try {
      await api.post('/backups', { type })
      setNotice(`${type} backup created.`)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not create the backup.')
    }
  }

  const restore = async (backup) => {
    try {
      await api.post(`/backups/${backup.id}/restore`)
      setNotice('Backup restored.')
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not restore this backup.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('DOCUMENT RECOVERY')}</div>
          <h1>{t('Backups')}</h1>
          <p>{t('Scheduled and on-demand backups of the database and uploaded files.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>Total backups</span><span className="stat-icon">◷</span></div>
          <strong>{backups.length}</strong>
          <small>Stored snapshots</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Database</span><span className="stat-icon">▤</span></div>
          <strong>{backups.filter((item) => item.type === 'database').length}</strong>
          <small>SQL dumps</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Files</span><span className="stat-icon">▧</span></div>
          <strong>{backups.filter((item) => item.type === 'files').length}</strong>
          <small>Upload snapshots</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{notice}</div>}

      <div className="feature-panel">
        <div className="panel-heading">
          <div><h3>Create a backup</h3><p>Run a snapshot now, in addition to the daily schedule.</p></div>
        </div>
        <div className="backup-actions">
          <button type="button" className="primary-action" onClick={() => create('database')}>＋ Database backup</button>
          <button type="button" className="secondary-action" onClick={() => create('files')}>＋ File backup</button>
        </div>
      </div>

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>Backup history</h3><p>Restore a snapshot when needed.</p></div></div>
        {backups.length ? (
          <div className="feature-list">
            {backups.map((backup) => (
              <div className="backup-row" key={backup.id}>
                <span className="list-item-icon">{backup.type === 'database' ? '▤' : '▧'}</span>
                <span className="list-item-copy">
                  <strong>{backup.type === 'database' ? 'Database' : 'Files'} backup</strong>
                  <span>{formatSize(backup.size_bytes)} · {new Date(backup.created_at).toLocaleString()}</span>
                </span>
                <button type="button" onClick={() => restore(backup)}>Restore</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">◷</div>
            <h3>No backups yet</h3>
            <p>Daily backups run automatically; create one manually above.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default Backups

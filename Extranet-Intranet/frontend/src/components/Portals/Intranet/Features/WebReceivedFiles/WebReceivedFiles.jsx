import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './WebReceivedFiles.css'
import { useT } from '../../../../../i18n'

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`
}

function WebReceivedFiles() {
  const t = useT()
  const [items, setItems] = useState([])
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await api.get('/received-files')
      setItems(response.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load received files.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const review = async (item, status) => {
    try {
      await api.patch(`/received-files/${item.id}`, { status })
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not save the review.')
    }
  }

  const download = async (item) => {
    try {
      const response = await api.get(`/received-files/${item.id}/download`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = item.original_name
      link.click()
      window.URL.revokeObjectURL(url)
    } catch {
      setNotice('Could not download this file.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('INCOMING DOCUMENTS')}</div>
          <h1>{t('Web Received Files')}</h1>
          <p>{t('Review and organize documents uploaded by external users.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>Received files</span><span className="stat-icon">⇩</span></div>
          <strong>{items.length}</strong>
          <small>All incoming files</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Pending review</span><span className="stat-icon">◷</span></div>
          <strong>{items.filter((item) => item.status === 'pending').length}</strong>
          <small>Awaiting attention</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Approved</span><span className="stat-icon">✓</span></div>
          <strong>{items.filter((item) => item.status === 'approved').length}</strong>
          <small>Reviewed submissions</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{notice}</div>}

      <div className="feature-panel">
        <div className="panel-heading">
          <div><h3>Incoming files</h3><p>Submitted through the public upload page.</p></div>
        </div>

        {items.length ? (
          <div className="feature-list">
            {items.map((item) => (
              <div className="received-row" key={item.id}>
                <span className="list-item-icon">⇩</span>
                <span className="list-item-copy">
                  <strong>{item.original_name}</strong>
                  <span>{item.sender_name} · {item.sender_email} · {formatSize(item.size_bytes)}</span>
                </span>
                <span className="item-status">{item.status}</span>
                <button type="button" onClick={() => download(item)}>Download</button>
                <button type="button" onClick={() => review(item, 'approved')}>Approve</button>
                <button type="button" className="cloud-remove" onClick={() => review(item, 'rejected')}>Reject</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">⇩</div>
            <h3>No files received</h3>
            <p>Files submitted by external users will appear here.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default WebReceivedFiles

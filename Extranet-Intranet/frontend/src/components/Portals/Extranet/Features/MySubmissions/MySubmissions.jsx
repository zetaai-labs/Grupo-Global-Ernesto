import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './MySubmissions.css'
import { useT } from '../../../../../i18n'

function MySubmissions() {
  const t = useT()
  const [items, setItems] = useState([])
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await api.get('/content/my-submissions')
      setItems(response.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load submissions.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const upload = async (event) => {
    event.preventDefault()
    if (!file) {
      setNotice('Choose a file first.')
      return
    }
    const data = new FormData()
    data.append('file', file)
    if (message) data.append('message', message)
    try {
      await api.post('/content/my-submissions', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setFile(null)
      setMessage('')
      event.target.reset()
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not upload this document.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('FILE SUBMISSIONS')}</div>
          <h1>{t('My Submissions')}</h1>
          <p>{t('Upload documents to Global Group and track their review status.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>Submitted files</span><span className="stat-icon">⇧</span></div>
          <strong>{items.length}</strong>
          <small>Total submissions</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Under review</span><span className="stat-icon">◷</span></div>
          <strong>{items.filter((item) => item.status === 'pending').length}</strong>
          <small>Awaiting review</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Approved</span><span className="stat-icon">✓</span></div>
          <strong>{items.filter((item) => item.status === 'approved').length}</strong>
          <small>Reviewed submissions</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{notice}</div>}

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>Upload a document</h3><p>Staff review submitted files in the Intranet.</p></div></div>
        <form className="submission-form" onSubmit={upload}>
          <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
          <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Note for the reviewer" />
          <button type="submit" className="primary-action">⇧ Submit document</button>
        </form>
      </div>

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>Your submissions</h3><p>Review status updates as staff process your files.</p></div></div>
        {items.length ? (
          <div className="feature-list">
            {items.map((item) => (
              <div className="submission-row" key={item.id}>
                <span className="list-item-icon">⇧</span>
                <span className="list-item-copy"><strong>{item.original_name}</strong><span>{new Date(item.created_at).toLocaleString()}{item.message ? ` · ${item.message}` : ''}</span></span>
                <span className="item-status">{item.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">⇧</div>
            <h3>No submissions yet</h3>
            <p>Upload a document using the form above.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default MySubmissions

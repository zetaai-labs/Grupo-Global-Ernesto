import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './MySubmissions.css'
import { useT, dateLocale } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'

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
          <div className="stat-top"><span>{t("Submitted files")}</span><span className="stat-icon">⇧</span></div>
          <strong>{items.length}</strong>
          <small>{t("Total submissions")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Under review")}</span><span className="stat-icon">◷</span></div>
          <strong>{items.filter((item) => item.status === 'pending').length}</strong>
          <small>{t("Awaiting review")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Approved")}</span><span className="stat-icon">✓</span></div>
          <strong>{items.filter((item) => item.status === 'approved').length}</strong>
          <small>{t("Reviewed submissions")}</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{translateServer(notice)}</div>}

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>{t("Upload a document")}</h3><p>{t("Staff review submitted files in the Intranet.")}</p></div></div>
        <form className="submission-form" onSubmit={upload}>
          <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
          <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("Note for the reviewer")} />
          <button type="submit" className="primary-action">{t("⇧ Submit document")}</button>
        </form>
      </div>

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>{t("Your submissions")}</h3><p>{t("Review status updates as staff process your files.")}</p></div></div>
        {items.length ? (
          <div className="feature-list">
            {items.map((item) => (
              <div className="submission-row" key={item.id}>
                <span className="list-item-icon">⇧</span>
                <span className="list-item-copy"><strong>{item.original_name}</strong><span>{new Date(item.created_at).toLocaleString(dateLocale())}{item.message ? ` · ${item.message}` : ''}</span></span>
                <span className="item-status">{item.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">⇧</div>
            <h3>{t("No submissions yet")}</h3>
            <p>{t("Upload a document using the form above.")}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default MySubmissions

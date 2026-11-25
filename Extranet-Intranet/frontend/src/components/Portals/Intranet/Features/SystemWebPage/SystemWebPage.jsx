import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import './SystemWebPage.css'
import { useT, dateLocale } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'

function SystemWebPage() {
  const t = useT()
  const isAdmin = getUser()?.role === 'admin'
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ title: '', body: '' })
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await api.get('/content/announcements')
      setItems(response.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load announcements.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async (event) => {
    event.preventDefault()
    try {
      await api.post('/content/announcements', form)
      setForm({ title: '', body: '' })
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not publish the announcement.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('CORPORATE INFORMATION')}</div>
          <h1>{t('System Web Page')}</h1>
          <p>{t('Company news and announcements for the internal workspace.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>{t("Announcements")}</span><span className="stat-icon">▣</span></div>
          <strong>{items.length}</strong>
          <small>{t("Published updates")}</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{translateServer(notice)}</div>}

      {isAdmin && (
        <div className="feature-panel">
          <div className="panel-heading"><div><h3>{t("Publish announcement")}</h3><p>{t("Visible to internal users in your region.")}</p></div></div>
          <form className="announcement-form" onSubmit={create}>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t("Title")} required />
            <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder={t("Message")} rows="3" required />
            <button type="submit" className="primary-action">{t("＋ Publish")}</button>
          </form>
        </div>
      )}

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>{t("News")}</h3><p>{t("Latest updates from the organisation.")}</p></div></div>
        {items.length ? (
          <div className="feature-list">
            {items.map((item) => (
              <div className="feature-list-row" key={item.id}>
                <div className="list-item-icon">▣</div>
                <div className="list-item-copy"><strong>{item.title}</strong><span>{item.body}</span></div>
                <span className="list-item-arrow">{item.author || t("System")} · {new Date(item.created_at).toLocaleDateString(dateLocale())}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">▣</div>
            <h3>{t("No announcements yet")}</h3>
            <p>{t("Corporate announcements and updates will appear here.")}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default SystemWebPage

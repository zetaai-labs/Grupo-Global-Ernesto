import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './RecycleBin.css'
import { useT, dateLocale } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'

function RecycleBin() {
  const t = useT()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get('/recycle-bin')
      setItems(response.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load the recycle bin.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const restore = async (item) => {
    try {
      await api.post(`/recycle-bin/${item.type}/${item.id}/restore`)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not restore this item.')
    }
  }

  const purge = async (item) => {
    try {
      await api.delete(`/recycle-bin/${item.type}/${item.id}`)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not delete this item.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('DOCUMENT RECOVERY')}</div>
          <h1>{t('Recycle Bin')}</h1>
          <p>{t('Review deleted files and restore items when required.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>{t("Deleted items")}</span><span className="stat-icon">▧</span></div>
          <strong>{items.length}</strong>
          <small>{t("Items in recycle bin")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Folders")}</span><span className="stat-icon">▤</span></div>
          <strong>{items.filter((item) => item.type === 'folder').length}</strong>
          <small>{t("Recoverable folders")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Files")}</span><span className="stat-icon">▧</span></div>
          <strong>{items.filter((item) => item.type === 'file').length}</strong>
          <small>{t("Recoverable documents")}</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{translateServer(notice)}</div>}

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t("Deleted items")}</h3>
            <p>{t("Restore or permanently remove items.")}</p>
          </div>
        </div>

        {loading ? (
          <p className="cloud-empty">{t("Loading…")}</p>
        ) : items.length ? (
          <div className="feature-list">
            {items.map((item) => (
              <div className="recycle-row" key={`${item.type}-${item.id}`}>
                <span className="list-item-icon">{item.type === 'folder' ? '▤' : '▧'}</span>
                <span className="list-item-copy">
                  <strong>{item.name}</strong>
                  <span>{item.type}{" "}{t("· deleted")}{" "}{new Date(item.deleted_at).toLocaleString(dateLocale())}</span>
                </span>
                <button type="button" onClick={() => restore(item)}>{t("Restore")}</button>
                <button type="button" className="cloud-remove" onClick={() => purge(item)}>{t("Delete forever")}</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">▧</div>
            <h3>{t("Nothing to recover")}</h3>
            <p>{t("There are currently no deleted items to display.")}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default RecycleBin

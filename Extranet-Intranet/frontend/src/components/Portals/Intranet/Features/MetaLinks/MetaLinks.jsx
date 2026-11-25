import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './MetaLinks.css'
import { useT, dateLocale } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'

function MetaLinks() {
  const t = useT()
  const [links, setLinks] = useState([])
  const [files, setFiles] = useState([])
  const [label, setLabel] = useState('')
  const [fileId, setFileId] = useState('')
  const [days, setDays] = useState(7)
  const [maxDownloads, setMaxDownloads] = useState(10)
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [linkResponse, fileResponse] = await Promise.all([
        api.get('/metalinks'),
        api.get('/files'),
      ])
      const fileList = fileResponse.data?.data || []
      setLinks(linkResponse.data?.data || [])
      setFiles(fileList)
      if (!fileId && fileList.length) setFileId(String(fileList[0].id))
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load MetaLinks.')
    }
  }, [fileId])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const create = async (event) => {
    event.preventDefault()
    try {
      await api.post('/metalinks', {
        label,
        file_id: Number(fileId),
        expires_in_days: Number(days),
        max_downloads: Number(maxDownloads),
        ...(password ? { password } : {}),
      })
      setLabel('')
      setPassword('')
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not create the MetaLink.')
    }
  }

  const remove = async (link) => {
    try {
      await api.delete(`/metalinks/${link.id}`)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not delete this link.')
    }
  }

  const copy = (link) => {
    const url = `${window.location.origin}/api/links/${link.token}`
    navigator.clipboard?.writeText(url)
    setNotice('Secure link copied to clipboard.')
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('SECURE FILE SHARING')}</div>
          <h1>{t('MetaLinks')}</h1>
          <p>{t('Create and manage secure links for controlled document distribution.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>{t("Active links")}</span><span className="stat-icon">↗</span></div>
          <strong>{links.filter((link) => !link.expired).length}</strong>
          <small>{t("Currently available")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Expired links")}</span><span className="stat-icon">◷</span></div>
          <strong>{links.filter((link) => link.expired).length}</strong>
          <small>{t("No longer active")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Total downloads")}</span><span className="stat-icon">⇩</span></div>
          <strong>{links.reduce((sum, link) => sum + link.downloads_count, 0)}</strong>
          <small>{t("Across all links")}</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{translateServer(notice)}</div>}

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t("Create a MetaLink")}</h3>
            <p>{t("Share a file without giving account access.")}</p>
          </div>
        </div>

        <form className="metalink-form" onSubmit={create}>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("Link label")} required />
          <select value={fileId} onChange={(event) => setFileId(event.target.value)} required>
            {!files.length && <option value="">{t("No files available")}</option>}
            {files.map((file) => (
              <option key={file.id} value={file.id}>{file.name}</option>
            ))}
          </select>
          <input type="number" min="1" value={days} onChange={(event) => setDays(event.target.value)} aria-label={t("Days until expiry")} />
          <input type="number" min="1" value={maxDownloads} onChange={(event) => setMaxDownloads(event.target.value)} aria-label={t("Maximum downloads")} />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("Optional password")} aria-label={t("Optional link password")} />
          <button type="submit" className="primary-action">{t("＋ Create MetaLink")}</button>
        </form>
      </div>

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t("Generated links")}</h3>
            <p>{t("Copy, monitor or revoke secure links.")}</p>
          </div>
        </div>

        {links.length ? (
          <div className="feature-list">
            {links.map((link) => (
              <div className="metalink-row" key={link.id}>
                <span className="list-item-icon">↗</span>
                <span className="list-item-copy">
                  <strong>{link.label}</strong>
                  <span>{link.file_name} · {link.downloads_count}/{link.max_downloads}{" "}{t("downloads · expires")}{" "}{new Date(link.expires_at).toLocaleDateString(dateLocale())}{link.has_password ? t(" · password protected") : ''}</span>
                </span>
                <span className={`item-status ${link.expired ? '' : 'status-active'}`}>
                  {link.expired ? t("Expired") : t("Active")}
                </span>
                <button type="button" onClick={() => copy(link)}>{t("Copy link")}</button>
                <button type="button" className="cloud-remove" onClick={() => remove(link)}>✕</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">↗</div>
            <h3>{t("No MetaLinks yet")}</h3>
            <p>{t("Your generated MetaLinks will appear here.")}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default MetaLinks

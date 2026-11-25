import { useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './SharedDocuments.css'
import { useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`
}

function SharedDocuments() {
  const t = useT()
  const [data, setData] = useState({ folders: [], files: [] })
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api.get('/external-shares/shared-with-me')
      .then((response) => setData(response.data?.data || { folders: [], files: [] }))
      .catch(() => setNotice('Could not load shared documents.'))
  }, [])

  const download = async (file) => {
    try {
      const response = await api.get(`/external-shares/shared-with-me/files/${file.id}/download`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      window.URL.revokeObjectURL(url)
    } catch {
      setNotice('Could not download this document.')
    }
  }

  const folders = data.folders || []
  const files = data.files || []

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('DOCUMENT ACCESS')}</div>
          <h1>{t('Shared Documents')}</h1>
          <p>{t('Browse documents and folders shared with your external account.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>{t("Shared folders")}</span><span className="stat-icon">▤</span></div>
          <strong>{folders.length}</strong>
          <small>{t("Accessible folders")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Shared files")}</span><span className="stat-icon">▧</span></div>
          <strong>{files.length}</strong>
          <small>{t("Available documents")}</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{translateServer(notice)}</div>}

      <div className="feature-panel">
        <div className="panel-heading">
          <div><h3>{t("Folders shared with you")}</h3><p>{t("Provided by your Global Group contact.")}</p></div>
        </div>
        {folders.length ? (
          <div className="feature-list">
            {folders.map((folder) => (
              <div className="feature-list-row" key={folder.id}>
                <div className="list-item-icon">▤</div>
                <div className="list-item-copy"><strong>{folder.name}</strong><span>{folder.file_count}{" "}{t("files ·")}{" "}{folder.region}</span></div>
                <span className="item-status">{t("Shared")}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">▤</div>
            <h3>{t("No folders shared")}</h3>
            <p>{t("Documents shared with your account will appear here.")}</p>
          </div>
        )}
      </div>

      <div className="feature-panel">
        <div className="panel-heading">
          <div><h3>{t("Documents")}</h3><p>{t("Download files from your shared folders.")}</p></div>
        </div>
        {files.length ? (
          <div className="feature-list">
            {files.map((file) => (
              <div className="shared-doc-row" key={file.id}>
                <span className="list-item-icon">▧</span>
                <span className="list-item-copy"><strong>{file.name}</strong><span>{formatSize(file.size_bytes)} · {file.mime_type}</span></span>
                <button type="button" onClick={() => download(file)}>{t("Download")}</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">▧</div>
            <h3>{t("No documents available")}</h3>
            <p>{t("Ask your contact to share a folder with you.")}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default SharedDocuments

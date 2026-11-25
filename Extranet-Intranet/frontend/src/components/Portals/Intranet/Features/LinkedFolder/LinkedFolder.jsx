import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './LinkedFolder.css'
import { useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'

function LinkedFolder() {
  const t = useT()
  const [links, setLinks] = useState([])
  const [folders, setFolders] = useState([])
  const [folderId, setFolderId] = useState('')
  const [label, setLabel] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [linkResponse, folderResponse] = await Promise.all([
        api.get('/content/linked-folders'),
        api.get('/folders'),
      ])
      const folderList = folderResponse.data?.data || []
      setLinks(linkResponse.data?.data || [])
      setFolders(folderList)
      if (!folderId && folderList.length) setFolderId(String(folderList[0].id))
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load linked folders.')
    }
  }, [folderId])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const add = async (event) => {
    event.preventDefault()
    try {
      await api.post('/content/linked-folders', { folder_id: Number(folderId), label })
      setLabel('')
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not link this folder.')
    }
  }

  const remove = async (link) => {
    try {
      await api.delete(`/content/linked-folders/${link.id}`)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not remove this link.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('COLLABORATION')}</div>
          <h1>{t('Linked Folder')}</h1>
          <p>{t('Keep quick shortcuts to the folders you use most.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>{t("Linked folders")}</span><span className="stat-icon">⇄</span></div>
          <strong>{links.length}</strong>
          <small>{t("Your shortcuts")}</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{translateServer(notice)}</div>}

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>{t("Add a shortcut")}</h3><p>{t("Point to a folder you already have access to.")}</p></div></div>
        <form className="linked-form" onSubmit={add}>
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)} required>
            {!folders.length && <option value="">{t("No folders available")}</option>}
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("Shortcut label")} required />
          <button type="submit" className="primary-action">{t("＋ Link folder")}</button>
        </form>
      </div>

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>{t("Your shortcuts")}</h3><p>{t("Remove links you no longer need.")}</p></div></div>
        {links.length ? (
          <div className="feature-list">
            {links.map((link) => (
              <div className="linked-row" key={link.id}>
                <span className="list-item-icon">⇄</span>
                <span className="list-item-copy"><strong>{link.label}</strong><span>{link.folder_name}</span></span>
                <button type="button" className="cloud-remove" onClick={() => remove(link)}>{t("Remove")}</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">⇄</div>
            <h3>{t("No linked folders")}</h3>
            <p>{t("Add a shortcut from the form above.")}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default LinkedFolder

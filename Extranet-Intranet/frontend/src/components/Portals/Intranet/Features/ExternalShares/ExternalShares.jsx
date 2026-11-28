import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './ExternalShares.css'
import { useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import { roleLabel } from '../../../../../utils/roles'

function ExternalShares() {
  const t = useT()
  const [shares, setShares] = useState([])
  const [folders, setFolders] = useState([])
  const [partners, setPartners] = useState([])
  const [folderId, setFolderId] = useState('')
  const [userId, setUserId] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [shareResponse, folderResponse, userResponse] = await Promise.all([
        api.get('/external-shares'),
        api.get('/folders'),
        api.get('/external-shares/recipients'),
      ])
      setShares(shareResponse.data?.data || [])
      const folderList = folderResponse.data?.data || []
      const partnerList = userResponse.data?.data || []
      setFolders(folderList)
      setPartners(partnerList)
      if (!folderId && folderList.length) setFolderId(String(folderList[0].id))
      if (!userId && partnerList.length) setUserId(String(partnerList[0].id))
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load external shares.')
    }
  }, [folderId, userId])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const share = async (event) => {
    event.preventDefault()
    try {
      await api.post('/external-shares', { folder_id: Number(folderId), user_id: Number(userId) })
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not create the share.')
    }
  }

  const revoke = async (share) => {
    try {
      await api.delete(`/external-shares/${share.id}`)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not revoke this share.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('COLLABORATION')}</div>
          <h1>{t('External Shares')}</h1>
          <p>{t('Share internal folders with partners, clients and suppliers in the Extranet.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>{t("Active shares")}</span><span className="stat-icon">♧</span></div>
          <strong>{shares.length}</strong>
          <small>{t("External accounts")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Partners")}</span><span className="stat-icon">♙</span></div>
          <strong>{partners.length}</strong>
          <small>{t("Available accounts")}</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{translateServer(notice)}</div>}

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>{t("Share a folder")}</h3><p>{t("Partners can read files in the selected folder.")}</p></div></div>
        <form className="external-share-form" onSubmit={share}>
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)} required>
            {!folders.length && <option value="">{t("No folders available")}</option>}
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <select value={userId} onChange={(event) => setUserId(event.target.value)} required>
            {!partners.length && <option value="">{t("No external accounts")}</option>}
            {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name} ({t(roleLabel(partner.role))})</option>)}
          </select>
          <button type="submit" className="primary-action">{t("♧ Share folder")}</button>
        </form>
      </div>

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>{t("Current shares")}</h3><p>{t("Revoke access at any time.")}</p></div></div>
        {shares.length ? (
          <div className="feature-list">
            {shares.map((share) => (
              <div className="external-share-row" key={share.id}>
                <span className="list-item-icon">♧</span>
                <span className="list-item-copy"><strong>{share.folder_name}</strong><span>{share.user_name} · {share.user_email}</span></span>
                <button type="button" className="cloud-remove" onClick={() => revoke(share)}>{t("Revoke")}</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">♧</div>
            <h3>{t("No external shares")}</h3>
            <p>{t("Folders shared with external accounts will appear here.")}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default ExternalShares

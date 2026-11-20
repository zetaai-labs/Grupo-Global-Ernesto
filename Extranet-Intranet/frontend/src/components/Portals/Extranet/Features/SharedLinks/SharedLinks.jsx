import { useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './SharedLinks.css'
import { useT } from '../../../../../i18n'

function SharedLinks() {
  const t = useT()
  const [links, setLinks] = useState([])
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api.get('/external-shares/shared-links')
      .then((response) => setLinks(response.data?.data || []))
      .catch(() => setNotice('Could not load shared links.'))
  }, [])

  const copy = (link) => {
    navigator.clipboard?.writeText(`${window.location.origin}/api/links/${link.token}`)
    setNotice('Secure link copied to clipboard.')
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('SECURE ACCESS')}</div>
          <h1>{t('Shared Links')}</h1>
          <p>{t('Access secure document links provided by your organisation.')}</p>
        </div>
      </div>

      {notice && <div className="cloud-notice">{notice}</div>}

      <div className="feature-panel">
        <div className="panel-heading">
          <div><h3>Available links</h3><p>Links to documents shared with your account.</p></div>
        </div>
        {links.length ? (
          <div className="feature-list">
            {links.map((link) => (
              <div className="shared-link-row" key={link.id}>
                <span className="list-item-icon">↗</span>
                <span className="list-item-copy">
                  <strong>{link.label}</strong>
                  <span>{link.file_name} · {link.downloads_count}/{link.max_downloads} downloads · expires {new Date(link.expires_at).toLocaleDateString()}</span>
                </span>
                <button type="button" onClick={() => copy(link)}>Copy link</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">↗</div>
            <h3>No links available</h3>
            <p>Links shared with your account will appear here.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default SharedLinks

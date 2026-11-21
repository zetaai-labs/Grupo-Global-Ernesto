import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { downloadFromApi } from '../../../../../utils/download'
import { useT } from '../../../../../i18n'
import '../../../Intranet/Features/InvestorVault/InvestorVault.css'

const SECTOR_LABELS = { FINTECH: 'Fintech', REAL_ESTATE: 'Real estate', HEALTHCARE: 'Healthcare', CYBERSECURITY: 'Cybersecurity', CROSS_BORDER_TRADE: 'Cross-border trade' }

/** Investor's own vault: profile, NDA status and the deal rooms granted to them. */
function MyVault() {
  const t = useT()
  const [me, setMe] = useState(null)
  const [rooms, setRooms] = useState([])
  const [ndaSigned, setNdaSigned] = useState(false)
  const [room, setRoom] = useState(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [profile, list] = await Promise.all([api.get('/vault/me'), api.get('/vault/rooms')])
      setMe(profile.data?.data)
      setRooms(list.data?.data || [])
      setNdaSigned(Boolean(list.data?.meta?.nda_signed))
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open your vault.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openRoom = async (roomId) => {
    try {
      setRoom((await api.get(`/vault/rooms/${roomId}`)).data?.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open this deal room.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('CONFIDENTIAL')}</div>
          <h1>{t('Investor Vault')}</h1>
          <p>{t('Your confidential investor profile and the deal rooms opened to you. All access is logged.')}</p>
        </div>
      </div>

      {notice && <div className="cloud-notice" role="status">{notice}</div>}

      {!me && <div className="feature-panel feature-empty-state"><div className="empty-icon">🔒</div><h3>{t('Your vault is being prepared')}</h3><p>{t('Grupo Global will set up your investor record after verification.')}</p></div>}

      {me && (
        <>
          <div className="feature-stats">
            <div className="stat-card"><div className="stat-top"><span>{t('Ticket size')}</span><span className="stat-icon">€</span></div><strong>{me.investment_ticket_range}</strong><small>{me.sector_focus.map((code) => t(SECTOR_LABELS[code])).join(', ')}</small></div>
            <div className="stat-card"><div className="stat-top"><span>NDA</span><span className="stat-icon">✍</span></div><strong>{ndaSigned ? t('Signed') : t('Pending')}</strong><small>{ndaSigned ? t('Deal rooms unlocked') : t('Accept the NDA banner above to unlock deal rooms')}</small></div>
            <div className="stat-card"><div className="stat-top"><span>{t('Deal rooms')}</span><span className="stat-icon">🗄</span></div><strong>{rooms.length}</strong><small>{t('Opened to you')}</small></div>
          </div>

          <div className="vault-layout">
            <div className="feature-panel vault-list">
              {rooms.map((item) => (
                <button type="button" key={item.room_id} className={`vault-row ${room?.room_id === item.room_id ? 'selected' : ''}`} onClick={() => openRoom(item.room_id)} disabled={!ndaSigned}>
                  <span><strong>{item.title}</strong><small>{t(SECTOR_LABELS[item.sector])} · {item.ticket_range || t('any ticket')} · {item.documents} {t('documents')}</small></span>
                  <span className={`vault-pill ${item.status === 'OPEN' ? 'ok' : ''}`}>{item.status === 'OPEN' ? t('Open') : t('Closed')}</span>
                </button>
              ))}
              {!rooms.length && <div className="feature-empty-state"><div className="empty-icon">🗄</div><h3>{t('No deal rooms yet')}</h3><p>{t('New opportunities will appear here and in your notifications.')}</p></div>}
            </div>
            {room && (
              <aside className="feature-panel vault-detail">
                <header><h2>{room.title}</h2><button type="button" onClick={() => setRoom(null)} aria-label={t('Close')}>✕</button></header>
                {room.summary && <p className="vault-notes">{room.summary}</p>}
                <h3>{t('Documents')}</h3>
                <ul className="vault-docs">
                  {room.documents.map((doc) => (
                    <li key={doc.document_id}>
                      {doc.original_name}
                      <button type="button" onClick={() => downloadFromApi(`/vault/rooms/${room.room_id}/documents/${doc.document_id}/download`, doc.original_name).catch(() => setNotice(t('Could not download this document.')))}>{t('Download')}</button>
                    </li>
                  ))}
                  {!room.documents.length && <li className="vault-muted">{t('No documents yet.')}</li>}
                </ul>
              </aside>
            )}
          </div>
        </>
      )}
    </section>
  )
}

export default MyVault

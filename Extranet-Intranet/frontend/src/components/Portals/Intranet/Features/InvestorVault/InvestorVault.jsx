import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { useT, dateLocale } from '../../../../../i18n'
import './InvestorVault.css'
import { translateServer } from '../../../../../i18n/serverMessages'

const SECTOR_LABELS = { FINTECH: 'Fintech', REAL_ESTATE: 'Real estate', HEALTHCARE: 'Healthcare', CYBERSECURITY: 'Cybersecurity', CROSS_BORDER_TRADE: 'Cross-border trade' }
const TICKETS = ['EUR 100K-500K', 'EUR 500K-1M', 'EUR 1M-5M', 'EUR 5M+']
const EMPTY_INVESTOR = { org_id: '', investment_ticket_range: 'EUR 1M-5M', sector_focus: [], nda_signed: false, full_name: '', email: '', phone: '', nationality: '', bank_name: '', iban: '', notes: '' }
const EMPTY_ROOM = { title: '', summary: '', sector: 'FINTECH', ticket_range: '' }

/** Super Administrator console for the Confidential Investor Vault (Schema Document §4.4). */
function InvestorVault() {
  const t = useT()
  const [tab, setTab] = useState('investors')
  const [investors, setInvestors] = useState([])
  const [rooms, setRooms] = useState([])
  const [investorOrgs, setInvestorOrgs] = useState([])
  const [selected, setSelected] = useState(null)
  const [room, setRoom] = useState(null)
  const [form, setForm] = useState(EMPTY_INVESTOR)
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM)
  const [showForm, setShowForm] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [inv, rms] = await Promise.all([api.get('/vault/investors'), api.get('/vault/rooms')])
      setInvestors(inv.data?.data || [])
      setRooms(rms.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open the vault.')
    }
  }, [])

  useEffect(() => {
    load()
    api.get('/organizations', { params: { type: 'INVESTOR', status: 'VERIFIED' } })
      .then((response) => setInvestorOrgs(response.data?.data || []))
      .catch(() => {})
  }, [load])

  const call = async (request, message) => {
    try {
      const response = await request()
      setNotice(response.data?.message || message)
      await load()
      return response
    } catch (error) {
      setNotice(error.response?.data?.message || 'The action could not be completed.')
      return null
    }
  }

  const openInvestor = async (id) => {
    try {
      setSelected((await api.get(`/vault/investors/${id}`)).data?.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open this record.')
    }
  }

  const openRoom = async (id) => {
    try {
      setRoom((await api.get(`/vault/rooms/${id}`)).data?.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open this deal room.')
    }
  }

  const toggleSector = (code) => setForm((current) => ({
    ...current,
    sector_focus: current.sector_focus.includes(code) ? current.sector_focus.filter((item) => item !== code) : [...current.sector_focus, code],
  }))

  const createInvestor = async (event) => {
    event.preventDefault()
    if (!form.sector_focus.length) return setNotice(t('Choose at least one sector.'))
    const { org_id: orgId, investment_ticket_range: ticket, sector_focus: sectors, nda_signed: nda, ...profile } = form
    const response = await call(() => api.post('/vault/investors', {
      org_id: orgId || null, investment_ticket_range: ticket, sector_focus: sectors, nda_signed: nda,
      profile: Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, value || null])),
    }), t('Investor record created (encrypted).'))
    if (response) {
      setForm(EMPTY_INVESTOR)
      setShowForm(false)
    }
    return undefined
  }

  const createRoom = async (event) => {
    event.preventDefault()
    const response = await call(() => api.post('/vault/rooms', { ...roomForm, ticket_range: roomForm.ticket_range || null, summary: roomForm.summary || null }), t('Deal room created.'))
    if (response) {
      setRoomForm(EMPTY_ROOM)
      setShowForm(false)
      openRoom(response.data.data.room_id)
    }
  }

  const uploadDoc = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !room) return
    const data = new FormData()
    data.append('file', file)
    await call(() => api.post(`/vault/rooms/${room.room_id}/documents`, data, { headers: { 'Content-Type': 'multipart/form-data' } }), t('Document uploaded (encrypted).'))
    event.target.value = ''
    openRoom(room.room_id)
  }

  const roomInvestors = (roomId) => rooms.find((item) => item.room_id === roomId)?.investors || []

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('CONFIDENTIAL · LEVEL 0-S')}</div>
          <h1>{t('Investor Vault')}</h1>
          <p>{t('Isolated, separately encrypted investor records and tier-1 deal rooms. Every access is logged.')}</p>
        </div>
        <button type="button" className="primary-action" onClick={() => setShowForm((value) => !value)}>
          ＋ {tab === 'investors' ? t('New investor') : t('New deal room')}
        </button>
      </div>

      <div className="vault-banner" role="note">
        🔒 {t('You are inside the Investor Vault. Views, downloads and changes are recorded in each investor’s access log and the audit trail.')}
      </div>

      {notice && <div className="cloud-notice vault-notice" role="status"><span>{translateServer(notice)}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss">✕</button></div>}

      <div className="vault-tabs" role="tablist">
        {[['investors', `${t('Investors')} (${investors.length})`], ['rooms', `${t('Deal rooms')} (${rooms.length})`]].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setShowForm(false) }}>{label}</button>
        ))}
      </div>

      {showForm && tab === 'investors' && (
        <form className="feature-panel vault-form" onSubmit={createInvestor}>
          <h3>{t('New investor (stored encrypted)')}</h3>
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder={t('Full name / fund name')} required />
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t('Email')} required />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t('Phone')} />
          <input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} placeholder={t('Nationality / jurisdiction')} />
          <input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder={t('Bank')} />
          <input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="IBAN" />
          <select value={form.investment_ticket_range} onChange={(e) => setForm({ ...form, investment_ticket_range: e.target.value })} aria-label={t('Ticket size')}>
            {TICKETS.map((ticket) => <option key={ticket} value={ticket}>{ticket}</option>)}
          </select>
          <select value={form.org_id} onChange={(e) => setForm({ ...form, org_id: e.target.value })} aria-label={t('Investor organisation')}>
            <option value="">{t('Not linked to a platform organisation')}</option>
            {investorOrgs.map((org) => <option key={org.org_id} value={org.org_id}>{org.legal_name}</option>)}
          </select>
          <fieldset className="vault-sectors">
            <legend>{t('Sector focus')}</legend>
            {Object.entries(SECTOR_LABELS).map(([code, label]) => (
              <label key={code}><input type="checkbox" checked={form.sector_focus.includes(code)} onChange={() => toggleSector(code)} /> {t(label)}</label>
            ))}
          </fieldset>
          <label className="vault-check"><input type="checkbox" checked={form.nda_signed} onChange={(e) => setForm({ ...form, nda_signed: e.target.checked })} /> {t('NDA signed (paper/e-signature)')}</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('Confidential notes')} rows="2" />
          <div className="vault-actions"><button type="submit" className="primary-action">{t('Save encrypted')}</button><button type="button" onClick={() => setShowForm(false)}>{t('Cancel')}</button></div>
        </form>
      )}

      {showForm && tab === 'rooms' && (
        <form className="feature-panel vault-form" onSubmit={createRoom}>
          <h3>{t('New deal room')}</h3>
          <input value={roomForm.title} onChange={(e) => setRoomForm({ ...roomForm, title: e.target.value })} placeholder={t('Deal title')} required />
          <select value={roomForm.sector} onChange={(e) => setRoomForm({ ...roomForm, sector: e.target.value })} aria-label={t('Sector')}>
            {Object.entries(SECTOR_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
          </select>
          <select value={roomForm.ticket_range} onChange={(e) => setRoomForm({ ...roomForm, ticket_range: e.target.value })} aria-label={t('Ticket size')}>
            <option value="">{t('Any ticket size')}</option>
            {TICKETS.map((ticket) => <option key={ticket} value={ticket}>{ticket}</option>)}
          </select>
          <textarea value={roomForm.summary} onChange={(e) => setRoomForm({ ...roomForm, summary: e.target.value })} placeholder={t('Investment summary')} rows="3" />
          <div className="vault-actions"><button type="submit" className="primary-action">{t('Create room')}</button><button type="button" onClick={() => setShowForm(false)}>{t('Cancel')}</button></div>
        </form>
      )}

      {tab === 'investors' && (
        <div className="vault-layout">
          <div className="feature-panel vault-list">
            {investors.map((inv) => (
              <button type="button" key={inv.investor_id} className={`vault-row ${selected?.investor_id === inv.investor_id ? 'selected' : ''}`} onClick={() => openInvestor(inv.investor_id)}>
                <span><strong>{inv.profile?.full_name || t('Encrypted record')}</strong><small>{inv.organization || t('No platform organisation')} · {inv.investment_ticket_range}</small></span>
                <span className={`vault-pill ${inv.nda_signed ? 'ok' : 'warn'}`}>{inv.nda_signed ? t("NDA ✓") : t('NDA pending')}</span>
              </button>
            ))}
            {!investors.length && <div className="feature-empty-state"><div className="empty-icon">🔒</div><h3>{t('No investor records')}</h3></div>}
          </div>
          {selected && (
            <aside className="feature-panel vault-detail">
              <header><h2>{selected.profile?.full_name}</h2><button type="button" onClick={() => setSelected(null)} aria-label={t('Close')}>✕</button></header>
              <dl className="vault-facts">
                {[['Email', selected.profile?.email], ['Phone', selected.profile?.phone], ['Jurisdiction', selected.profile?.nationality], ['Bank', selected.profile?.bank_name], ['IBAN', selected.profile?.iban],
                  ['Ticket', selected.investment_ticket_range], ['Sectors', selected.sector_focus.map((code) => t(SECTOR_LABELS[code])).join(', ')], ['Deal rooms', selected.rooms]].map(([label, value]) => (
                  <div key={label}><dt>{t(label)}</dt><dd className={label === 'IBAN' ? 'mono' : ''}>{value || '—'}</dd></div>
                ))}
              </dl>
              {selected.profile?.notes && <p className="vault-notes">{selected.profile.notes}</p>}
              <label className="vault-check">
                <input type="checkbox" checked={selected.nda_signed} onChange={(e) => call(() => api.patch(`/vault/investors/${selected.investor_id}`, { nda_signed: e.target.checked }), t('NDA status updated.')).then(() => openInvestor(selected.investor_id))} />
                {t('NDA signed')}
              </label>
              <h3>{t('Access log')}</h3>
              <ol className="vault-log">
                {selected.access_audit_log.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}><span className="mono">{new Date(entry.at).toLocaleString(dateLocale())}</span><strong>{entry.action}</strong><small>{entry.role || '—'} · {entry.ip}</small></li>
                ))}
              </ol>
            </aside>
          )}
        </div>
      )}

      {tab === 'rooms' && (
        <div className="vault-layout">
          <div className="feature-panel vault-list">
            {rooms.map((item) => (
              <button type="button" key={item.room_id} className={`vault-row ${room?.room_id === item.room_id ? 'selected' : ''}`} onClick={() => openRoom(item.room_id)}>
                <span><strong>{item.title}</strong><small>{t(SECTOR_LABELS[item.sector])} · {item.ticket_range || t('any ticket')} · {item.documents} {t('documents')}</small></span>
                <span className="vault-pill">{item.investors.length} {t('investors')}</span>
              </button>
            ))}
            {!rooms.length && <div className="feature-empty-state"><div className="empty-icon">🗄</div><h3>{t('No deal rooms')}</h3></div>}
          </div>
          {room && (
            <aside className="feature-panel vault-detail">
              <header><h2>{room.title}</h2><button type="button" onClick={() => setRoom(null)} aria-label={t('Close')}>✕</button></header>
              {room.summary && <p className="vault-notes">{room.summary}</p>}
              <h3>{t('Documents')}</h3>
              <ul className="vault-docs">
                {room.documents.map((doc) => <li key={doc.document_id}>{doc.original_name}<small>{Math.round(doc.size_bytes / 1024)} KB</small></li>)}
                {!room.documents.length && <li className="vault-muted">{t('No documents yet.')}</li>}
              </ul>
              <label className="vault-upload">{t('Upload document (encrypted)')}<input type="file" onChange={uploadDoc} /></label>
              <h3>{t('Investors with access')}</h3>
              <ul className="vault-docs">
                {roomInvestors(room.room_id).map((id) => {
                  const inv = investors.find((item) => item.investor_id === id)
                  return (
                    <li key={id}>{inv?.profile?.full_name || id}
                      <button type="button" onClick={() => call(() => api.delete(`/vault/rooms/${room.room_id}/access/${id}`), t('Access revoked.'))}>{t('Revoke')}</button>
                    </li>
                  )
                })}
              </ul>
              <select value="" aria-label={t('Grant access')} onChange={(e) => e.target.value && call(() => api.post(`/vault/rooms/${room.room_id}/access`, { investor_id: e.target.value }), t('Access granted.'))}>
                <option value="">{t('Grant access to investor…')}</option>
                {investors.filter((inv) => !roomInvestors(room.room_id).includes(inv.investor_id)).map((inv) => <option key={inv.investor_id} value={inv.investor_id}>{inv.profile?.full_name}</option>)}
              </select>
            </aside>
          )}
        </div>
      )}
    </section>
  )
}

export default InvestorVault

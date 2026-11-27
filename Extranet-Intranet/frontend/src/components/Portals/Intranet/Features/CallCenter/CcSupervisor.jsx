import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { dateLocale, useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import { OUTCOME_LABELS, OUTCOME_TONE, PURPOSE_LABELS, REGION_LABELS, STATUS_LABELS, minutes } from './ccLabels'

const EMPTY_CAMPAIGN = { name: '', purpose: 'MEMBERSHIP_SALES', direction: 'OUTBOUND', region: 'GLOBAL', script: '' }
const COLUMNS = ['name', 'company', 'phone', 'email', 'country', 'notes']

/** Reads a CSV (comma or semicolon, quoted fields allowed) whose first row names the columns. */
function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const delimiter = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ','
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1 } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const [header, ...body] = rows.filter((line) => line.some((value) => value.trim()))
  if (!header) return []
  const keys = header.map((value) => value.trim().toLowerCase())
  return body.map((line) => Object.fromEntries(COLUMNS.filter((key) => keys.includes(key)).map((key) => [key, (line[keys.indexOf(key)] || '').trim() || null])))
}

export function CcLive() {
  const t = useT()
  const [board, setBoard] = useState(null)
  // The fetch time is kept with the data, so "for N minutes" is worked out from it (render stays pure).
  const load = useCallback(() => api.get('/call-center/live').then((response) => setBoard({ ...response.data.data, at: Date.now() })).catch(() => {}), [])
  useEffect(() => {
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [load])
  if (!board) return <div className="page-loading" role="status" aria-live="polite" />
  const since = (value) => {
    const mins = Math.max(0, Math.round((board.at - new Date(value)) / 60000))
    return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`
  }
  return (
    <div className="cc-live">
      <div className="feature-stats">
        <div className="stat-card"><div className="stat-top"><span>{t('Agents available')}</span><span className="stat-icon">✓</span></div><strong>{board.totals.available}</strong><small>{t('{count} on a call', { count: board.totals.on_call })}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Calls today')}</span><span className="stat-icon">☎</span></div><strong>{board.totals.calls}</strong><small>{t('{time} talking', { time: minutes(board.totals.talk_sec) })}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Interested or sales')}</span><span className="stat-icon">★</span></div><strong>{board.totals.positive}</strong><small>{t('{pct}% of calls', { pct: board.totals.conversion_pct })}</small></div>
      </div>
      <div className="zx-table-wrap zx-card">
        <table>
          <thead><tr><th>{t('Agent')}</th><th>{t('Status')}</th><th>{t('Now calling')}</th><th>{t('Calls')}</th><th>{t('Talk time')}</th><th>{t('Interested or sales')}</th></tr></thead>
          <tbody>
            {board.agents.map((agent) => (
              <tr key={agent.user_id}>
                <td><bdi>{agent.name}</bdi><small className="cc-muted"> · {agent.team} · {t(REGION_LABELS[agent.region] || agent.region)}</small></td>
                <td><span className={`cc-pill cc-s-${agent.status}`}>{t(STATUS_LABELS[agent.status])}</span> <small className="cc-muted">{since(agent.status_since)}</small></td>
                <td>{agent.current_contact ? <bdi>{agent.current_contact}</bdi> : '—'}</td>
                <td>{agent.calls}</td><td>{minutes(agent.talk_sec)}</td><td>{agent.positive}</td>
              </tr>
            ))}
            {!board.agents.length && <tr><td colSpan="6" className="zx-empty">{t('No agents yet. Add them on the Agents tab.')}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="cc-grid-2">
        <div className="feature-panel">
          <h3>{t('Outcomes today')}</h3>
          <div className="cc-chips">
            {board.outcomes.map((row) => <span key={row.outcome} className={`cc-pill cc-${OUTCOME_TONE[row.outcome]}`}>{t(OUTCOME_LABELS[row.outcome])}: {row.total}</span>)}
            {!board.outcomes.length && <span className="cc-muted">{t('No calls yet today.')}</span>}
          </div>
        </div>
        <div className="feature-panel">
          <h3>{t('By region today')}</h3>
          <ul className="cc-list">
            {board.regions.map((row) => <li key={row.region}><strong>{t(REGION_LABELS[row.region] || row.region)}</strong> <span>{t('{calls} calls · {positive} interested or sales', { calls: row.calls, positive: row.positive })}</span></li>)}
            {!board.regions.length && <li className="cc-muted">{t('No calls yet today.')}</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function CcCampaigns({ notify }) {
  const t = useT()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null)
  const [importing, setImporting] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api.get('/call-center/campaigns').then((response) => setRows(response.data.data)).catch(() => {}), [])
  useEffect(() => { load() }, [load])

  const run = async (work, message) => {
    setBusy(true)
    try {
      const response = await work()
      notify(typeof message === 'function' ? message(response.data.data) : t(message))
      setForm(null)
      await load()
    } catch (error) {
      notify(translateServer(error.response?.data?.message) || t('The action could not be completed.'))
    } finally {
      setBusy(false)
    }
  }

  const sendImport = (event) => {
    event.preventDefault()
    const contacts = parseCsv(importing.text)
    if (!contacts.length) return notify(t('No contacts found. The first row must name the columns, for example: name,company,phone,email,country'))
    return run(() => api.post(`/call-center/campaigns/${importing.campaign_id}/contacts`, { contacts }), (data) => {
      setImporting(null)
      return t('{added} added · {duplicates} already there · {dnc} on the do-not-call list · {invalid} without phone or email', {
        added: data.added, duplicates: data.duplicates, dnc: data.do_not_call, invalid: data.invalid,
      })
    })
  }

  const readFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImporting((current) => ({ ...current, text: String(reader.result || '') }))
    reader.readAsText(file)
  }

  return (
    <div className="cc-campaigns">
      <div className="cc-actions"><button type="button" className="primary-action" onClick={() => setForm(EMPTY_CAMPAIGN)}>＋ {t('New campaign')}</button></div>
      {form && (
        <form className="feature-panel cc-form" onSubmit={(event) => { event.preventDefault(); run(() => api.post('/call-center/campaigns', form), 'Campaign created.') }}>
          <input required minLength="2" maxLength="150" placeholder={t('Campaign name')} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <select value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} aria-label={t('Purpose')}>
            {Object.entries(PURPOSE_LABELS).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
          </select>
          <select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })} aria-label={t('Type')}>
            <option value="OUTBOUND">{t('Outgoing calls (we call them)')}</option>
            <option value="INBOUND">{t('Incoming line (they call us)')}</option>
          </select>
          <select value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} aria-label={t('Region')}>
            {Object.entries(REGION_LABELS).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
          </select>
          <textarea rows="5" maxLength="8000" placeholder={t('Call script: how to open, key points, answers to common objections…')} value={form.script} onChange={(event) => setForm({ ...form, script: event.target.value })} />
          <div className="cc-actions"><button type="button" className="secondary-action" onClick={() => setForm(null)}>{t('Cancel')}</button><button type="submit" className="primary-action" disabled={busy}>{t('Save')}</button></div>
        </form>
      )}
      {importing && (
        <form className="feature-panel cc-form" onSubmit={sendImport}>
          <strong>{t('Add contacts to {name}', { name: importing.name })}</strong>
          <small className="cc-muted">{t('Paste or choose a CSV file. First row: name,company,phone,email,country,notes. Each contact needs a phone or an email. Duplicates and do-not-call numbers are skipped.')}</small>
          <input type="file" accept=".csv,text/csv" onChange={(event) => readFile(event.target.files?.[0])} />
          <textarea rows="6" value={importing.text} onChange={(event) => setImporting({ ...importing, text: event.target.value })} placeholder="name,company,phone,email,country" />
          <div className="cc-actions"><button type="button" className="secondary-action" onClick={() => setImporting(null)}>{t('Cancel')}</button><button type="submit" className="primary-action" disabled={busy}>{t('Import')}</button></div>
        </form>
      )}
      <div className="zx-table-wrap zx-card">
        <table>
          <thead><tr><th>{t('Campaign')}</th><th>{t('Progress')}</th><th>{t('Calls')}</th><th>{t('Interested or sales')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>
            {rows.map((row) => {
              const pct = row.contacts ? Math.round(((row.done + row.do_not_call) / row.contacts) * 100) : 0
              return (
                <tr key={row.campaign_id}>
                  <td><strong>{row.name}</strong><small className="cc-muted"><br />{t(PURPOSE_LABELS[row.purpose])} · {t(row.direction === 'INBOUND' ? 'Incoming' : 'Outgoing')} · {t(REGION_LABELS[row.region])}</small></td>
                  <td>
                    {row.direction === 'OUTBOUND' ? (
                      <>
                        <div className="cc-progress" aria-label={`${pct}%`}><span style={{ width: `${pct}%` }} /></div>
                        <small className="cc-muted">{t('{done} of {total} finished · {left} to call · {callbacks} callbacks', { done: row.done + row.do_not_call, total: row.contacts, left: row.to_call, callbacks: row.callbacks })}</small>
                      </>
                    ) : <small className="cc-muted">{t('{total} callers', { total: row.contacts })}</small>}
                  </td>
                  <td>{row.calls}</td>
                  <td>{row.positive}{row.calls ? <small className="cc-muted"> ({Math.round((row.positive / row.calls) * 100)}%)</small> : ''}</td>
                  <td>
                    <select value={row.status} disabled={busy} aria-label={t('Status')} onChange={(event) => run(() => api.patch(`/call-center/campaigns/${row.campaign_id}`, { status: event.target.value }), 'Saved.')}>
                      <option value="ACTIVE">{t('Active')}</option><option value="PAUSED">{t('Paused')}</option><option value="CLOSED">{t('Closed')}</option>
                    </select>
                  </td>
                  <td>{row.direction === 'OUTBOUND' && <button type="button" className="zx-link" onClick={() => setImporting({ campaign_id: row.campaign_id, name: row.name, text: '' })}>＋ {t('Add contacts')}</button>}</td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan="6" className="zx-empty">{t('No campaigns yet. Create one to start calling.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function CcAgents({ notify }) {
  const t = useT()
  const [data, setData] = useState({ agents: [], available_staff: [], regions: [] })
  const [form, setForm] = useState({ user_id: '', team: 'General', region: 'GLOBAL' })
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api.get('/call-center/agents').then((response) => setData(response.data.data)).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  const run = async (work, message) => {
    setBusy(true)
    try {
      await work()
      notify(t(message))
      await load()
    } catch (error) {
      notify(translateServer(error.response?.data?.message) || t('The action could not be completed.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="cc-agents">
      <form className="feature-panel cc-form cc-inline" onSubmit={(event) => { event.preventDefault(); run(() => api.post('/call-center/agents', { ...form, user_id: Number(form.user_id) }), 'Agent added.') }}>
        <select required value={form.user_id} onChange={(event) => setForm({ ...form, user_id: event.target.value })} aria-label={t('Staff member')}>
          <option value="">{t('Choose a staff member…')}</option>
          {data.available_staff.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
        </select>
        <input required maxLength="80" placeholder={t('Team, e.g. Bengaluru')} value={form.team} onChange={(event) => setForm({ ...form, team: event.target.value })} />
        <select value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} aria-label={t('Region')}>
          {Object.entries(REGION_LABELS).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
        </select>
        <button type="submit" className="primary-action" disabled={busy}>＋ {t('Add agent')}</button>
      </form>
      <div className="zx-table-wrap zx-card">
        <table>
          <thead><tr><th>{t('Agent')}</th><th>{t('Team')}</th><th>{t('Region')}</th><th>{t('Status')}</th><th>{t('Since')}</th><th /></tr></thead>
          <tbody>
            {data.agents.map((agent) => (
              <tr key={agent.user_id} className={agent.active ? '' : 'cc-off'}>
                <td><bdi>{agent.name}</bdi><small className="cc-muted"><br />{agent.email}</small></td>
                <td>{agent.team}</td><td>{t(REGION_LABELS[agent.region] || agent.region)}</td>
                <td><span className={`cc-pill cc-s-${agent.status}`}>{t(agent.active ? STATUS_LABELS[agent.status] : 'Switched off')}</span></td>
                <td>{new Date(agent.created_at).toLocaleDateString(dateLocale())}</td>
                <td><button type="button" className="zx-link" disabled={busy} onClick={() => run(() => api.patch(`/call-center/agents/${agent.user_id}`, { active: !agent.active }), agent.active ? 'Agent switched off.' : 'Agent switched on.')}>{t(agent.active ? 'Switch off' : 'Switch on')}</button></td>
              </tr>
            ))}
            {!data.agents.length && <tr><td colSpan="6" className="zx-empty">{t('No agents yet. Add staff members above.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

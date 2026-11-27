import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import api from '../../../../api/client'
import { useT, dateLocale } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import { CatalogPanel, ClockPanel, MusterPanel, OrgChart, PosPanel } from './ZylaxPanels'
import AttendanceTeam from './AttendanceTeam'
import { errorText, formatValue, humanize, statusTone, toInputValue } from './zylaxFormat'
import ZylaxReport from './ZylaxReport'
import FleetPanel from './FleetPanel'
import OnboardingAccounts from './OnboardingAccounts'
import EventPanel from './EventPanel'
import AiSmartSearch from './AiSmartSearch'
import { AiSummaryButton } from '../AiAssistant'
import { downloadFromApi } from '../../../../utils/download'
import './Zylax.css'

const hub = (module, entity) => `/zylax/hub/${module}/${entity}`

function FieldInput({ field, value, onChange, lookups, refOptions }) {
  const t = useT()
  const common = { value: value ?? '', required: field.required, 'aria-label': t(field.label), onChange: (event) => onChange(event.target.value) }
  const choose = (options) => (
    <select {...common}>
      <option value="">{t('Select...')}</option>
      {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select>
  )
  switch (field.type) {
    case 'select': return choose(field.options.map((option) => [option, t(humanize(option))]))
    case 'user': return choose(lookups.users.map((user) => [user.id, user.name]))
    case 'org': return choose(lookups.orgs.map((org) => [org.id, org.name]))
    case 'product': return choose(lookups.products.map((item) => [item.id, `${item.sku} · ${item.name}`]))
    case 'ref': return choose((refOptions[`${field.module}/${field.entity}`] || []).map((row) => [row.record_id, `${row.ref_no} · ${row.title}`]))
    case 'textarea': return <textarea rows="3" {...common} />
    case 'date': return <input type="date" {...common} />
    case 'month': return <input type="month" {...common} />
    case 'datetime': return <input type="datetime-local" {...common} />
    case 'email': return <input type="email" {...common} />
    case 'phone': return <input type="tel" {...common} />
    case 'money': return <input type="number" min="0" step="0.01" {...common} />
    case 'number': return <input type="number" min="0" step="any" {...common} />
    case 'integer': return <input type="number" min="0" step="1" {...common} />
    case 'percent': return <input type="number" min="0" max="100" step="0.1" {...common} />
    case 'rating': return <input type="number" min="1" max="5" step="1" {...common} />
    default: return <input type="text" maxLength="500" {...common} />
  }
}

function ZylaxModule() {
  const t = useT()
  const { module: moduleKey } = useParams()
  const portal = useLocation().pathname.startsWith('/extranet') ? 'extranet' : 'intranet'
  const [module, setModule] = useState(null)
  const [missing, setMissing] = useState(false)
  const [entityKey, setEntityKey] = useState('')
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ counts: {}, sum: null })
  const [lookups, setLookups] = useState({ users: [], orgs: [], products: [] })
  const [refOptions, setRefOptions] = useState({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showReport, setShowReport] = useState(false)
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)
  const [comment, setComment] = useState('')
  const [internal, setInternal] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [boardView, setBoardView] = useState(false)

  const entity = useMemo(() => module?.entities.find((item) => item.key === entityKey) || null, [module, entityKey])

  useEffect(() => {
    let active = true
    setModule(null)
    setMissing(false)
    setForm(null)
    setDetail(null)
    setRows([])
    api.get('/zylax/hub/modules').then((response) => {
      if (!active) return
      const found = (response.data?.data || []).find((item) => item.key === moduleKey)
      if (!found) return setMissing(true)
      setModule(found)
      setEntityKey(found.entities[0]?.key || '')
      setBoardView(found.view === 'board')
      return undefined
    }).catch(() => active && setMissing(true))
    api.get('/zylax/hub/lookups').then((response) => active && setLookups(response.data?.data || { users: [], orgs: [], products: [] })).catch(() => {})
    return () => { active = false }
  }, [moduleKey])

  const load = useCallback(async () => {
    if (!entityKey || !module) return
    try {
      const response = await api.get(hub(module.key, entityKey), { params: { q: search || undefined, status: statusFilter || undefined } })
      setRows(response.data?.data || [])
      setMeta(response.data?.meta || { counts: {}, sum: null })
    } catch (error) {
      setNotice(errorText(error, t('Could not load this page.')))
    }
  }, [module, entityKey, search, statusFilter, t])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!entity) return
    const targets = [...new Set(entity.fields.filter((field) => field.type === 'ref').map((field) => `${field.module}/${field.entity}`))]
    targets.forEach((target) => {
      const [targetModule, targetEntity] = target.split('/')
      api.get(hub(targetModule, targetEntity))
        .then((response) => setRefOptions((current) => ({ ...current, [target]: response.data?.data || [] })))
        .catch(() => {})
    })
  }, [entity])

  const switchEntity = (key) => {
    if (key === entityKey) return
    setEntityKey(key)
    setRows([])
    setForm(null)
    setDetail(null)
    setSearch('')
    setStatusFilter('')
  }

  const exportList = async (format) => {
    const params = new URLSearchParams({ format })
    if (search) params.set('q', search)
    if (statusFilter) params.set('status', statusFilter)
    try {
      await downloadFromApi(`${hub(module.key, entityKey)}/export?${params}`, `${module.key}-${entityKey}.${format}`)
    } catch {
      setNotice(t('Could not export this list.'))
    }
  }

  const open = useCallback(async (id) => {
    try {
      const response = await api.get(`${hub(module.key, entityKey)}/${id}`)
      setForm(null)
      setDetail(response.data.data)
    } catch (error) {
      setNotice(errorText(error, t('Could not open this record.')))
    }
  }, [module, entityKey, t])

  const run = async (work, message, reopenId) => {
    setBusy(true)
    try {
      const result = await work()
      if (message) setNotice(t(message))
      await load()
      if (reopenId) await open(reopenId)
      return result || true
    } catch (error) {
      setNotice(errorText(error, t('The action could not be completed.')))
      return null
    } finally {
      setBusy(false)
    }
  }

  const editableFields = (entity?.fields || []).filter((field) => !field.computed && !(portal === 'extranet' && field.customer))

  const startCreate = () => {
    setDetail(null)
    setForm({ id: null, title: '', values: {} })
  }
  const startEdit = () => {
    const values = {}
    for (const field of editableFields) values[field.key] = toInputValue(field, detail.data[field.key])
    setForm({ id: detail.record_id, title: detail.title, values })
    setDetail(null)
  }
  const submit = async (event) => {
    event.preventDefault()
    const body = { title: form.title }
    for (const field of editableFields) {
      const raw = form.values[field.key]
      if (raw === undefined && form.id) continue
      body[field.key] = field.type === 'datetime' && raw ? new Date(raw).toISOString() : (raw ?? null)
    }
    const editingId = form.id
    const done = await run(
      () => (editingId ? api.patch(`${hub(module.key, entityKey)}/${editingId}`, body) : api.post(hub(module.key, entityKey), body)),
      'Saved.',
    )
    if (done) {
      setForm(null)
      await open(editingId || done.data.data.record_id)
    }
  }

  const addComment = async (event) => {
    event.preventDefault()
    if (!comment.trim()) return
    const done = await run(() => api.post(`${hub(module.key, entityKey)}/${detail.record_id}/comments`, { body: comment, internal }), null, detail.record_id)
    if (done) setComment('')
  }

  const upload = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const data = new FormData()
    data.append('file', file)
    // Employee profiles: "HR only" keeps a document from the employee; otherwise they see it and are notified.
    if (detail?.private_files) data.append('internal', internal ? 'true' : 'false')
    run(() => api.post(`${hub(module.key, entityKey)}/${detail.record_id}/files`, data, { timeout: 120000 }), 'File added.', detail.record_id)
  }

  const download = async (item) => {
    try {
      const response = await api.get(`${hub(module.key, entityKey)}/${detail.record_id}/files/${item.file_id}`, { responseType: 'blob', timeout: 120000 })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = item.name
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setNotice(errorText(error, t('Could not download the file.')))
    }
  }

  if (missing) {
    return (
      <section className="feature-page">
        <div className="cloud-notice" role="alert">{t('This module is not available for your account.')}</div>
        <Link to={`/${portal}/zylax`}>← {t('Back to ZYLAX')}</Link>
      </section>
    )
  }
  if (!module) return <section className="feature-page"><p className="zx-empty">{t('Loading...')}</p></section>

  const columns = (entity?.fields || []).filter((field) => !['textarea'].includes(field.type) && !field.secret).slice(0, 3)
  const boardStatuses = entity?.statuses || []

  return (
    <section className="feature-page">
      <Link className="zh-back" to={`/${portal}/zylax`}>← {t('All ZYLAX modules')}</Link>
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">ZYLAX · {t(module.group)}</div>
          <h1>{t(module.name)}</h1>
          <p>{t(module.description)}</p>
        </div>
        <div className="zh-head-actions">
          {module.link && <Link className="zh-secondary" to={module.link}>{t('Open full workspace')}</Link>}
          {entity?.can_create && <button type="button" className="primary-action" onClick={startCreate}>＋ {t('New')}</button>}
        </div>
      </div>

      {notice && (
        <div className="cloud-notice zx-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label={t('Dismiss')}>✕</button>
        </div>
      )}

      {module.view === 'clock' && <ClockPanel onChange={load} />}
      {module.view === 'clock' && portal === 'intranet' && <AttendanceTeam />}
      {module.view === 'muster' && <MusterPanel onChange={load} />}
      {module.view === 'pos' && <PosPanel />}
      {module.view === 'catalog' && <CatalogPanel portal={portal} />}
      {module.view === 'orgchart' && entityKey === 'profiles' && <OrgChart rows={rows} />}

      {module.entities.length > 0 && (
        <>
          <div className="zx-tabs" role="tablist">
            {module.entities.map((item) => (
              <button key={item.key} type="button" role="tab" aria-selected={entityKey === item.key} className={entityKey === item.key ? 'active' : ''} onClick={() => switchEntity(item.key)}>{t(item.label)}</button>
            ))}
          </div>

          <div className="feature-stats zh-stats">
            <div className="stat-card"><div className="stat-top"><span>{t('Records')}</span></div><strong>{rows.length}</strong></div>
            {meta.sum !== null && meta.sum !== undefined && <div className="stat-card"><div className="stat-top"><span>{t('Total (EUR)')}</span></div><strong>{formatValue({ type: 'money' }, meta.sum)}</strong></div>}
            {Object.entries(meta.counts || {}).slice(0, 3).map(([status, count]) => <div key={status} className="stat-card"><div className="stat-top"><span>{t(humanize(status))}</span></div><strong>{count}</strong></div>)}
          </div>

          {form && (
            <form className="zx-form" onSubmit={submit}>
              <h3 className="zh-form-title">{t(form.id ? 'Edit record' : 'New record')} · {t(entity.label)}</h3>
              {!entity.auto_title && <label>{t(entity.title_label)} *<input required minLength="2" maxLength="255" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>}
              {editableFields.map((field) => (
                <label key={field.key} className={field.type === 'textarea' ? 'zh-wide' : ''}>
                  {t(field.label)}{field.required ? ' *' : ''}{field.secret ? ` 🔒` : ''}
                  <FieldInput field={field} value={form.values[field.key]} lookups={lookups} refOptions={refOptions} onChange={(value) => setForm({ ...form, values: { ...form.values, [field.key]: value } })} />
                </label>
              ))}
              <div className="zx-form-actions">
                <button type="submit" className="primary-action" disabled={busy}>{t('Save')}</button>
                <button type="button" onClick={() => setForm(null)}>{t('Cancel')}</button>
              </div>
            </form>
          )}

          {detail && (
            <article className="zx-detail">
              <header>
                <div>
                  <h3>{detail.title} <span className={`zx-pill ${statusTone(detail.status)}`}>{t(humanize(detail.status))}</span></h3>
                  <p className="zx-mono">{detail.ref_no}</p>
                </div>
                <button type="button" onClick={() => setDetail(null)} aria-label={t('Close')}>✕</button>
              </header>
              <dl className="zh-fields">
                {entity.fields.filter((field) => detail.data[field.key] !== undefined && detail.data[field.key] !== null).map((field) => (
                  <div key={field.key} className={field.type === 'textarea' ? 'zh-wide' : ''}><dt>{t(field.label)}{field.secret ? ' 🔒' : ''}</dt><dd>{formatValue(field, detail.data[field.key], detail.labels, t)}</dd></div>
                ))}
              </dl>
              {module.key === 'onboarding' && entityKey === 'plans' && detail.status === 'IN_PROGRESS' && portal === 'intranet' && <OnboardingAccounts key={detail.record_id} planId={detail.record_id} onDone={() => open(detail.record_id)} />}
              {portal === 'intranet' && <AiSummaryButton key={`ai-${detail.record_id}`} path={`/zylax/${module.key}/${entityKey}/${detail.record_id}/summary`} />}
              {module.key === 'events' && entityKey === 'events' && portal === 'intranet' && <EventPanel key={detail.record_id} event={detail} />}
              {module.key === 'fleet' && entityKey === 'vehicles' && portal === 'intranet' && <FleetPanel key={detail.record_id} vehicleId={detail.record_id} onShared={() => { load(); open(detail.record_id) }} />}
              <div className="zx-form-actions">
                {detail.transitions.map((to) => (
                  <button key={to} type="button" className={['CANCELLED', 'REJECTED', 'DECLINED', 'LOST', 'WITHDRAWN'].includes(to) ? '' : 'primary-action'} disabled={busy} onClick={() => run(() => api.post(`${hub(module.key, entityKey)}/${detail.record_id}/transition`, { to }), 'Status updated.', detail.record_id)}>
                    → {t(humanize(to))}
                  </button>
                ))}
                {detail.actions?.includes('convertRfq') && <button type="button" className="primary-action" disabled={busy} onClick={() => run(() => api.post(`${hub(module.key, entityKey)}/${detail.record_id}/actions/convertRfq`, {}), 'Draft quote created.', detail.record_id)}>{t('Create quote')}</button>}
                {detail.can_edit && <button type="button" onClick={startEdit}>{t('Edit')}</button>}
                {detail.can_add !== false && <label className="zh-file">{t('Attach file')}<input type="file" onChange={upload} disabled={busy} /></label>}
              </div>
              {detail.private_files && (
                <p className="zh-private">🔒 {detail.can_add === false
                  ? t('Documents and notes on this profile are private to HR and the employee.')
                  : t('Documents and notes here are seen only by HR and this employee. Tick “HR only” to keep one from the employee.')}</p>
              )}
              {detail.files?.length > 0 && (
                <ul className="zh-files">
                  {detail.files.map((item) => <li key={item.file_id}><button type="button" className="zx-link" onClick={() => download(item)}>{item.name}</button></li>)}
                </ul>
              )}
              <ol className="zx-timeline">
                {detail.events.map((event) => (
                  <li key={event.event_id} className={event.internal ? 'zh-internal' : ''}>
                    <span>{new Date(event.created_at).toLocaleString(dateLocale())}{event.author ? ` · ${event.author}` : ''}{event.internal ? ` · ${t(detail.private_files ? 'HR only' : 'Internal')}` : ''}</span>
                    <div>{event.kind === 'status' && event.to_status ? `→ ${t(humanize(event.to_status))} ` : ''}{event.kind === 'created' ? t('Created') : ''}{event.kind === 'updated' ? t('Updated') : ''}{event.body ? ` ${translateServer(event.body)}` : ''}</div>
                  </li>
                ))}
              </ol>
              {detail.can_add !== false && (
                <form className="zh-comment" onSubmit={addComment}>
                  <input aria-label={t('Add a comment')} placeholder={t('Add a comment...')} value={comment} maxLength="5000" onChange={(event) => setComment(event.target.value)} />
                  {portal === 'intranet' && (!detail.private_files || detail.can_edit) && (
                    <label><input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} /> {t(detail.private_files ? 'HR only' : 'Internal')}</label>
                  )}
                  <button type="submit" disabled={busy || !comment.trim()}>{t('Send')}</button>
                </form>
              )}
            </article>
          )}

          <div className="zx-toolbar zh-toolbar">
            <input type="search" aria-label={t('Search')} placeholder={t('Search...')} value={search} onChange={(event) => setSearch(event.target.value)} />
            {portal === 'intranet' && <AiSmartSearch moduleKey={module.key} entityKey={entityKey} onFilters={({ status, q }) => { setStatusFilter(status); setSearch(q) }} />}
            <select aria-label={t('Status')} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">{t('All statuses')}</option>
              {boardStatuses.map((status) => <option key={status} value={status}>{t(humanize(status))}</option>)}
            </select>
            {module.view === 'board' && entityKey === module.entities[0]?.key && <button type="button" className="zh-secondary" onClick={() => setBoardView((value) => !value)}>{t(boardView ? 'List view' : 'Board view')}</button>}
            <button type="button" className="zh-secondary" aria-pressed={showReport} onClick={() => setShowReport((value) => !value)}>{t(showReport ? 'Hide report' : 'Report')}</button>
            <button type="button" className="zh-secondary" onClick={() => exportList('xlsx')}>{t('Excel')}</button>
            <button type="button" className="zh-secondary" onClick={() => exportList('csv')}>{t('CSV')}</button>
          </div>
          {showReport && <ZylaxReport key={`${module.key}/${entityKey}`} path={hub(module.key, entityKey)} />}

          {boardView && entityKey === module.entities[0]?.key ? (
            <div className="zh-board">
              {boardStatuses.map((status) => (
                <div key={status} className="zh-column">
                  <h4>{t(humanize(status))} <span>{rows.filter((row) => row.status === status).length}</span></h4>
                  {rows.filter((row) => row.status === status).map((row) => (
                    <button key={row.record_id} type="button" className="zh-task" onClick={() => open(row.record_id)}><strong>{row.title}</strong><small className="zx-mono">{row.ref_no}</small></button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="zx-table-wrap zx-card">
              <table>
                <thead><tr><th>{t('Ref')}</th><th>{t(entity?.title_label || 'Title')}</th>{columns.map((field) => <th key={field.key}>{t(field.label)}</th>)}<th>{t('Status')}</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.record_id} className="zx-click" tabIndex="0" onClick={() => open(row.record_id)} onKeyDown={(event) => event.key === 'Enter' && open(row.record_id)}>
                      <td className="zx-mono">{row.ref_no}</td><td>{row.title}</td>
                      {columns.map((field) => <td key={field.key}>{formatValue(field, row.data[field.key], row.labels, t)}</td>)}
                      <td><span className={`zx-pill ${statusTone(row.status)}`}>{t(humanize(row.status))}</span></td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={columns.length + 3} className="zx-empty">{t('Nothing here yet.')}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default ZylaxModule

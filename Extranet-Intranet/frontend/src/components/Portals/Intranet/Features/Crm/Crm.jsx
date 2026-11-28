import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import { useT, dateLocale } from '../../../../../i18n'
import './Crm.css'
import { translateServer } from '../../../../../i18n/serverMessages'
import { AiSummaryButton } from '../../../Shared/AiAssistant'
import { roleLabel } from '../../../../../utils/roles'

const STAGE_LABELS = {
  LEAD: 'Lead',
  PROPOSAL: 'Proposal',
  DUE_DILIGENCE: 'Due diligence',
  ACTIVE_CONTRACT: 'Active contract',
  ARCHIVED: 'Archived',
}
const TYPE_LABELS = { CLIENT: 'Client', STRATEGIC_PARTNER: 'Strategic partner', DELEGATION_NODE: 'Delegation node', VENDOR: 'Vendor' }
const CONF_LABELS = { PUBLIC: 'Public', INTERNAL: 'Internal', RESTRICTED: 'Restricted', HIGHLY_CONFIDENTIAL: 'Highly confidential' }
const EMPTY = { entity_id: '', title: '', contact_type: 'CLIENT', confidentiality_level: 'RESTRICTED', estimated_value_eur: '', assigned_manager: '', note: '' }

const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(value || 0))

function Crm() {
  const t = useT()
  const user = getUser()
  const canCreate = ['admin', 'manager'].includes(user?.role)

  const [rels, setRels] = useState([])
  const [meta, setMeta] = useState({ stages: Object.keys(STAGE_LABELS), pipeline: {} })
  const [filters, setFilters] = useState({ q: '', type: '', mine: false })
  const [selected, setSelected] = useState(null)
  const [managers, setManagers] = useState([])
  const [orgs, setOrgs] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const params = { q: filters.q || undefined, type: filters.type || undefined, mine: filters.mine ? 'true' : undefined }
      const response = await api.get('/crm', { params })
      setRels(response.data?.data || [])
      setMeta(response.data?.meta || meta)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load the CRM.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const open = useCallback(async (relId) => {
    try {
      const response = await api.get(`/crm/${relId}`)
      setSelected(response.data?.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open this relationship.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api.get('/crm/managers').then((response) => setManagers(response.data?.data || [])).catch(() => {})
    if (canCreate) {
      api.get('/organizations', { params: { status: 'VERIFIED' } }).then((response) => {
        setOrgs((response.data?.data || []).filter((org) => !['PARENT', 'BUSINESS_UNIT'].includes(org.org_type)))
      }).catch(() => {})
    }
  }, [canCreate])

  const refresh = async (message) => {
    if (message) setNotice(message)
    await load()
    if (selected) await open(selected.rel_id)
  }

  const update = async (patch) => {
    try {
      const response = await api.patch(`/crm/${selected.rel_id}`, patch)
      await refresh(response.data?.message)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not update the relationship.')
    }
  }

  const move = (rel, direction) => {
    const index = meta.stages.indexOf(rel.pipeline_stage)
    const next = meta.stages[index + direction]
    if (!next) return
    api.patch(`/crm/${rel.rel_id}`, { pipeline_stage: next })
      .then(() => refresh(t('Moved to {stage}.', { stage: t(STAGE_LABELS[next]) })))
      .catch((error) => setNotice(error.response?.data?.message || 'Could not move the relationship.'))
  }

  const addNote = async (event) => {
    event.preventDefault()
    if (!note.trim()) return
    try {
      await api.post(`/crm/${selected.rel_id}/activities`, { body: note })
      setNote('')
      await open(selected.rel_id)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not add the note.')
    }
  }

  const create = async (event) => {
    event.preventDefault()
    try {
      const response = await api.post('/crm', {
        ...form,
        estimated_value_eur: form.estimated_value_eur === '' ? null : Number(form.estimated_value_eur),
        assigned_manager: form.assigned_manager ? Number(form.assigned_manager) : null,
        note: form.note || undefined,
      })
      setShowCreate(false)
      setForm(EMPTY)
      await refresh(t('Relationship created.'))
      open(response.data.data.rel_id)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not create the relationship.')
    }
  }

  const activeValue = meta.pipeline?.ACTIVE_CONTRACT?.value_eur || 0
  const openValue = ['LEAD', 'PROPOSAL', 'DUE_DILIGENCE'].reduce((sum, stage) => sum + (meta.pipeline?.[stage]?.value_eur || 0), 0)

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('BUSINESS')}</div>
          <h1>{t('CRM Pipeline')}</h1>
          <p>{t('Business relationships across corridors, from first lead to active contract, with confidentiality controls.')}</p>
        </div>
        {canCreate && <button type="button" className="primary-action" onClick={() => setShowCreate((value) => !value)}>＋ {t('New relationship')}</button>}
      </div>

      <div className="feature-stats">
        <div className="stat-card"><div className="stat-top"><span>{t('Open pipeline')}</span><span className="stat-icon">€</span></div><strong>{euro(openValue)}</strong><small>{t('Lead → due diligence')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Active contracts')}</span><span className="stat-icon">✓</span></div><strong>{euro(activeValue)}</strong><small>{meta.pipeline?.ACTIVE_CONTRACT?.count || 0} {t('relationships')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Relationships')}</span><span className="stat-icon">◈</span></div><strong>{rels.length}</strong><small>{t('Visible to you')}</small></div>
      </div>

      {notice && (
        <div className="cloud-notice crm-notice" role="status">
          <span>{translateServer(notice)}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
        </div>
      )}

      {showCreate && (
        <form className="feature-panel crm-create" onSubmit={create}>
          <h3>{t('New relationship')}</h3>
          <select value={form.entity_id} onChange={(e) => setForm({ ...form, entity_id: e.target.value })} required aria-label={t('Organisation')}>
            <option value="">{t('Choose organisation…')}</option>
            {orgs.map((org) => <option key={org.org_id} value={org.org_id}>{org.legal_name}</option>)}
          </select>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('Opportunity title')} required />
          <select value={form.contact_type} onChange={(e) => setForm({ ...form, contact_type: e.target.value })} aria-label={t('Contact type')}>
            {Object.entries(TYPE_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
          </select>
          <select value={form.confidentiality_level} onChange={(e) => setForm({ ...form, confidentiality_level: e.target.value })} aria-label={t('Confidentiality')}>
            {Object.entries(CONF_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
          </select>
          <input type="number" min="0" step="1000" value={form.estimated_value_eur} onChange={(e) => setForm({ ...form, estimated_value_eur: e.target.value })} placeholder={t('Estimated value (EUR)')} />
          <select value={form.assigned_manager} onChange={(e) => setForm({ ...form, assigned_manager: e.target.value })} aria-label={t('Account manager')}>
            <option value="">{t('Assign to me')}</option>
            {managers.map((person) => <option key={person.id} value={person.id}>{person.name} ({t(roleLabel(person.role))})</option>)}
          </select>
          <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t('First note (optional)')} rows="2" />
          <div className="crm-actions">
            <button type="submit" className="primary-action">{t('Create')}</button>
            <button type="button" onClick={() => setShowCreate(false)}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      <div className="crm-toolbar">
        <input type="search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder={t('Search opportunity or organisation')} aria-label={t('Search')} />
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} aria-label={t('Contact type')}>
          <option value="">{t('All types')}</option>
          {Object.entries(TYPE_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
        </select>
        <label className="crm-mine"><input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} /> {t('Assigned to me')}</label>
      </div>

      <div className="crm-board">
        {meta.stages.map((stage, stageIndex) => {
          const cards = rels.filter((rel) => rel.pipeline_stage === stage)
          return (
            <section key={stage} className={`crm-column crm-col-${stage.toLowerCase()}`} aria-label={t(STAGE_LABELS[stage])}>
              <header>
                <strong>{t(STAGE_LABELS[stage])}</strong>
                <span>{cards.length} · {euro(meta.pipeline?.[stage]?.value_eur)}</span>
              </header>
              {cards.map((rel) => (
                <article key={rel.rel_id} className={`crm-card ${selected?.rel_id === rel.rel_id ? 'selected' : ''}`}>
                  <button type="button" className="crm-card-open" onClick={() => open(rel.rel_id)}>
                    <strong>{rel.title}</strong>
                    <span>{rel.organization}</span>
                    <span className="crm-card-meta">
                      <em className={`crm-conf crm-conf-${rel.confidentiality_level.toLowerCase()}`}>{t(CONF_LABELS[rel.confidentiality_level])}</em>
                      {rel.estimated_value_eur ? <b>{euro(rel.estimated_value_eur)}</b> : null}
                    </span>
                    <small>{rel.manager_name || t('Unassigned')} · {rel.region_corridor}{rel.source === 'website' ? ` · ${t('website lead')}` : ''}</small>
                  </button>
                  {rel.can_edit && (
                    <div className="crm-move">
                      <button type="button" disabled={stageIndex === 0} onClick={() => move(rel, -1)} aria-label={t('Move back')}>←</button>
                      <button type="button" disabled={stageIndex === meta.stages.length - 1} onClick={() => move(rel, 1)} aria-label={t('Move forward')}>→</button>
                    </div>
                  )}
                </article>
              ))}
              {!cards.length && <p className="crm-empty">{t('No relationships')}</p>}
            </section>
          )
        })}
      </div>

      {selected && (
        <aside className="feature-panel crm-detail" aria-label={t('Relationship details')}>
          <header>
            <div>
              <h2>{selected.title}</h2>
              <p>{selected.organization} · {t(TYPE_LABELS[selected.contact_type])} · {selected.region_corridor} · {selected.country}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label={t('Close')}>✕</button>
          </header>

          <AiSummaryButton key={`ai-${selected.rel_id}`} path={`/crm/${selected.rel_id}/next-step`} label="Suggest next step" />

          <div className="crm-fields">
            <label>{t('Stage')}
              <select value={selected.pipeline_stage} disabled={!selected.can_edit} onChange={(e) => update({ pipeline_stage: e.target.value })}>
                {meta.stages.map((stage) => <option key={stage} value={stage}>{t(STAGE_LABELS[stage])}</option>)}
              </select>
            </label>
            <label>{t('Confidentiality')}
              <select value={selected.confidentiality_level} disabled={!selected.can_edit} onChange={(e) => update({ confidentiality_level: e.target.value })}>
                {Object.entries(CONF_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
              </select>
            </label>
            <label>{t('Account manager')}
              <select value={selected.assigned_manager || ''} disabled={!selected.can_edit} onChange={(e) => update({ assigned_manager: Number(e.target.value) })}>
                {!selected.assigned_manager && <option value="">{t('Unassigned')}</option>}
                {managers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            <label>{t('Estimated value (EUR)')}
              <input type="number" min="0" step="1000" defaultValue={selected.estimated_value_eur ?? ''} key={`v-${selected.rel_id}-${selected.updated_at}`} disabled={!selected.can_edit}
                onBlur={(e) => e.target.value !== String(selected.estimated_value_eur ?? '') && update({ estimated_value_eur: e.target.value === '' ? null : Number(e.target.value) })} />
            </label>
            <label>{t('Next action')}
              <input type="date" defaultValue={selected.next_action_at ? selected.next_action_at.slice(0, 10) : ''} key={`d-${selected.rel_id}-${selected.updated_at}`} disabled={!selected.can_edit}
                onChange={(e) => update({ next_action_at: e.target.value || null })} />
            </label>
          </div>

          <form className="crm-note" onSubmit={addNote}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Add a note: call summary, next steps…')} rows="2" />
            <button type="submit" className="primary-action">{t('Add note')}</button>
          </form>

          <ol className="crm-timeline">
            {selected.activities.map((activity) => (
              <li key={activity.activity_id} className={`crm-activity crm-activity-${activity.kind.toLowerCase()}`}>
                <span className="crm-activity-meta">{activity.author || t('System')} · {new Date(activity.created_at).toLocaleString(dateLocale())}</span>
                <p>{activity.body}</p>
              </li>
            ))}
          </ol>
        </aside>
      )}
    </section>
  )
}

export default Crm

import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import { useT, dateLocale } from '../../../../../i18n'
import './Projects.css'
import { translateServer } from '../../../../../i18n/serverMessages'

const CORRIDOR_LABELS = {
  SPAIN_EU_INDIA: 'Spain – EU – India',
  LATAM_EXPANSION: 'LATAM expansion',
  GCC_DUBAI: 'GCC / Dubai',
  NORTH_AFRICA: 'North Africa',
}
const PHASE_LABELS = { INITIATION: 'Initiation', PLANNING: 'Planning', EXECUTION: 'Execution', MONITORING: 'Monitoring', COMPLETED: 'Completed' }
const STATUS_LABELS = { PLANNED: 'Planned', IN_PROGRESS: 'In progress', DONE: 'Done', BLOCKED: 'Blocked' }
const EMPTY = { title: '', description: '', corridor: 'SPAIN_EU_INDIA', budget_eur: '', phase: 'INITIATION', lead_entity: '', start_date: '', end_date: '' }
const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(value || 0))

function Projects() {
  const t = useT()
  const user = getUser()
  const canCreate = ['admin', 'manager'].includes(user?.role)

  const [projects, setProjects] = useState([])
  const [meta, setMeta] = useState({ phases: Object.keys(PHASE_LABELS), corridors: Object.keys(CORRIDOR_LABELS), totals: { budget: 0 } })
  const [filters, setFilters] = useState({ phase: '', corridor: '', mine: false })
  const [selected, setSelected] = useState(null)
  const [units, setUnits] = useState([])
  const [partners, setPartners] = useState([])
  const [staff, setStaff] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [milestone, setMilestone] = useState({ title: '', due_date: '', shared_with_partners: false })
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const params = { phase: filters.phase || undefined, corridor: filters.corridor || undefined, mine: filters.mine ? 'true' : undefined }
      const response = await api.get('/projects', { params })
      setProjects(response.data?.data || [])
      if (response.data?.meta) setMeta(response.data.meta)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load projects.')
    }
  }, [filters])

  const open = useCallback(async (projectId) => {
    try {
      const response = await api.get(`/projects/${projectId}`)
      setSelected(response.data?.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open this project.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api.get('/workflows/people').then((response) => setStaff(response.data?.data || [])).catch(() => {})
    if (canCreate) {
      api.get('/organizations', { params: { status: 'VERIFIED' } }).then((response) => {
        const orgs = response.data?.data || []
        setUnits(orgs.filter((org) => ['PARENT', 'BUSINESS_UNIT'].includes(org.org_type)))
        setPartners(orgs.filter((org) => !['PARENT', 'BUSINESS_UNIT'].includes(org.org_type)))
      }).catch(() => {})
    }
  }, [canCreate])

  const refresh = async (message) => {
    if (message) setNotice(message)
    await load()
    if (selected) await open(selected.project_id)
  }

  const call = async (request, fallback) => {
    try {
      const response = await request()
      await refresh(response.data?.message || fallback)
      return response
    } catch (error) {
      setNotice(error.response?.data?.message || 'The action could not be completed.')
      return null
    }
  }

  const create = async (event) => {
    event.preventDefault()
    const response = await call(() => api.post('/projects', {
      ...form,
      budget_eur: Number(form.budget_eur || 0),
      description: form.description || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    }), t('Project created.'))
    if (response) {
      setShowCreate(false)
      setForm(EMPTY)
      open(response.data.data.project_id)
    }
  }

  const addMilestone = async (event) => {
    event.preventDefault()
    const response = await call(() => api.post(`/projects/${selected.project_id}/milestones`, { ...milestone, due_date: milestone.due_date || null }), t('Milestone added.'))
    if (response) setMilestone({ title: '', due_date: '', shared_with_partners: false })
  }

  const done = (project) => (project.milestones ? Math.round((project.milestones_done / project.milestones) * 100) : 0)

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('BUSINESS')}</div>
          <h1>{t('Projects & Programs')}</h1>
          <p>{t('Joint ventures, corporate initiatives, real estate developments and software deployments across the corridors.')}</p>
        </div>
        {canCreate && <button type="button" className="primary-action" onClick={() => setShowCreate((value) => !value)}>＋ {t('New project')}</button>}
      </div>

      <div className="feature-stats">
        <div className="stat-card"><div className="stat-top"><span>{t('Projects')}</span><span className="stat-icon">▦</span></div><strong>{projects.length}</strong><small>{t('In current view')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Total budget')}</span><span className="stat-icon">€</span></div><strong>{euro(meta.totals?.budget)}</strong><small>{t('Allocated')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('In execution')}</span><span className="stat-icon">▶</span></div><strong>{meta.totals?.byPhase?.EXECUTION || 0}</strong><small>{t('Active delivery')}</small></div>
      </div>

      {notice && (
        <div className="cloud-notice prj-notice" role="status"><span>{translateServer(notice)}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss">✕</button></div>
      )}

      {showCreate && (
        <form className="feature-panel prj-create" onSubmit={create}>
          <h3>{t('New project')}</h3>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('Project title')} required />
          <select value={form.lead_entity} onChange={(e) => setForm({ ...form, lead_entity: e.target.value })} required aria-label={t('Lead business unit')}>
            <option value="">{t('Lead business unit…')}</option>
            {units.map((unit) => <option key={unit.org_id} value={unit.org_id}>{unit.legal_name}</option>)}
          </select>
          <select value={form.corridor} onChange={(e) => setForm({ ...form, corridor: e.target.value })} aria-label={t('Corridor')}>
            {meta.corridors.map((code) => <option key={code} value={code}>{t(CORRIDOR_LABELS[code])}</option>)}
          </select>
          <select value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} aria-label={t('Phase')}>
            {meta.phases.map((code) => <option key={code} value={code}>{t(PHASE_LABELS[code])}</option>)}
          </select>
          <input type="number" min="0" step="1000" value={form.budget_eur} onChange={(e) => setForm({ ...form, budget_eur: e.target.value })} placeholder={t('Budget (EUR)')} required />
          <label className="prj-date">{t('Start')}<input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
          <label className="prj-date">{t('End')}<input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('Description')} rows="2" />
          <div className="prj-actions">
            <button type="submit" className="primary-action">{t('Create')}</button>
            <button type="button" onClick={() => setShowCreate(false)}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      <div className="prj-toolbar">
        <select value={filters.phase} onChange={(e) => setFilters({ ...filters, phase: e.target.value })} aria-label={t('Phase')}>
          <option value="">{t('All phases')}</option>
          {meta.phases.map((code) => <option key={code} value={code}>{t(PHASE_LABELS[code])}</option>)}
        </select>
        <select value={filters.corridor} onChange={(e) => setFilters({ ...filters, corridor: e.target.value })} aria-label={t('Corridor')}>
          <option value="">{t('All corridors')}</option>
          {meta.corridors.map((code) => <option key={code} value={code}>{t(CORRIDOR_LABELS[code])}</option>)}
        </select>
        <label className="prj-mine"><input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} /> {t('My projects')}</label>
      </div>

      <div className="prj-layout">
        <div className="prj-grid">
          {projects.map((project) => (
            <button type="button" key={project.project_id} className={`prj-card ${selected?.project_id === project.project_id ? 'selected' : ''}`} onClick={() => open(project.project_id)}>
              <span className={`prj-phase prj-phase-${project.phase.toLowerCase()}`}>{t(PHASE_LABELS[project.phase])}</span>
              <strong>{project.title}</strong>
              <span>{project.lead_entity_name} · {t(CORRIDOR_LABELS[project.corridor])}</span>
              <span className="prj-budget">{euro(project.budget_eur)}</span>
              <span className="prj-progress" aria-label={t('{n}% of milestones done', { n: done(project) })}><i style={{ width: `${done(project)}%` }} /></span>
              <small>{project.milestones_done}/{project.milestones} {t('milestones')} · {project.members} {t('members')}{project.owner_name ? ` · ${project.owner_name}` : ''}</small>
            </button>
          ))}
          {!projects.length && <div className="feature-empty-state"><div className="empty-icon">▦</div><h3>{t('No projects yet')}</h3><p>{t('Create a project to start tracking delivery.')}</p></div>}
        </div>

        {selected && (
          <aside className="feature-panel prj-detail">
            <header>
              <div>
                <h2>{selected.title}</h2>
                <p>{selected.lead_entity_name} · {t(CORRIDOR_LABELS[selected.corridor])} · {euro(selected.budget_eur)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label={t('Close')}>✕</button>
            </header>
            {selected.description && <p className="prj-desc">{selected.description}</p>}

            <label className="prj-field">{t('Phase')}
              <select value={selected.phase} disabled={!selected.can_manage} onChange={(e) => call(() => api.patch(`/projects/${selected.project_id}`, { phase: e.target.value }), t('Phase updated.'))}>
                {meta.phases.map((code) => <option key={code} value={code}>{t(PHASE_LABELS[code])}</option>)}
              </select>
            </label>

            <section>
              <h3>{t('Milestones')}</h3>
              <ul className="prj-milestones">
                {selected.milestones.map((item) => (
                  <li key={item.milestone_id}>
                    <span><strong>{item.title}</strong><small>{item.due_date ? new Date(item.due_date).toLocaleDateString(dateLocale()) : t('No date')}{item.shared_with_partners ? ` · ${t('shared with partners')}` : ''}</small></span>
                    <select value={item.status} disabled={!selected.can_update} aria-label={t('Status')}
                      onChange={(e) => call(() => api.patch(`/projects/${selected.project_id}/milestones/${item.milestone_id}`, { status: e.target.value }), t('Milestone updated.'))}>
                      {Object.entries(STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
                    </select>
                  </li>
                ))}
                {!selected.milestones.length && <li className="prj-muted">{t('No milestones yet.')}</li>}
              </ul>
              {selected.can_update && (
                <form className="prj-inline" onSubmit={addMilestone}>
                  <input value={milestone.title} onChange={(e) => setMilestone({ ...milestone, title: e.target.value })} placeholder={t('New milestone')} required />
                  <input type="date" value={milestone.due_date} onChange={(e) => setMilestone({ ...milestone, due_date: e.target.value })} aria-label={t('Due date')} />
                  <label><input type="checkbox" checked={milestone.shared_with_partners} onChange={(e) => setMilestone({ ...milestone, shared_with_partners: e.target.checked })} /> {t('Share with partners')}</label>
                  <button type="submit">{t('Add')}</button>
                </form>
              )}
            </section>

            <section>
              <h3>{t('Team')}</h3>
              <ul className="prj-chips">
                {selected.members.map((member) => (
                  <li key={member.id}>
                    {member.name} <em>{member.project_role}</em>
                    {selected.can_manage && member.id !== selected.owner_id && (
                      <button type="button" aria-label={t('Remove')} onClick={() => call(() => api.delete(`/projects/${selected.project_id}/members/${member.id}`), t('Team member removed.'))}>✕</button>
                    )}
                  </li>
                ))}
              </ul>
              {selected.can_manage && (
                <select value="" aria-label={t('Add team member')} onChange={(e) => e.target.value && call(() => api.post(`/projects/${selected.project_id}/members`, { user_id: Number(e.target.value) }), t('Team member added.'))}>
                  <option value="">{t('Add team member…')}</option>
                  {staff.filter((person) => !selected.members.some((member) => member.id === person.id)).map((person) => <option key={person.id} value={person.id}>{person.name} ({person.role})</option>)}
                </select>
              )}
            </section>

            <section>
              <h3>{t('Partner organisations')}</h3>
              <ul className="prj-chips">
                {selected.partners.map((partner) => (
                  <li key={partner.org_id}>
                    {partner.legal_name}
                    {selected.can_manage && <button type="button" aria-label={t('Remove')} onClick={() => call(() => api.delete(`/projects/${selected.project_id}/partners/${partner.org_id}`), t('Partner unlinked.'))}>✕</button>}
                  </li>
                ))}
                {!selected.partners.length && <li className="prj-muted">{t('Not shared with any partner.')}</li>}
              </ul>
              {selected.can_manage && partners.length > 0 && (
                <select value="" aria-label={t('Link partner')} onChange={(e) => e.target.value && call(() => api.post(`/projects/${selected.project_id}/partners`, { org_id: e.target.value }), t('Partner linked.'))}>
                  <option value="">{t('Link partner organisation…')}</option>
                  {partners.filter((org) => !selected.partners.some((p) => p.org_id === org.org_id)).map((org) => <option key={org.org_id} value={org.org_id}>{org.legal_name}</option>)}
                </select>
              )}
              <p className="prj-muted">{t('Partners see only milestones marked “shared”, never the budget.')}</p>
            </section>
          </aside>
        )}
      </div>
    </section>
  )
}

export default Projects

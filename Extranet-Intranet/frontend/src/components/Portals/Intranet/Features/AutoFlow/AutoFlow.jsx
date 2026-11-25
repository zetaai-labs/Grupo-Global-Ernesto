import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import './AutoFlow.css'
import { useT, dateLocale } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'

const EMPTY_FORM = { title: '', description: '', template: 'purchase', approver_id: '', assigned_to: '', due_at: '' }
const FILTERS = [
  ['action', 'Needs my action'],
  ['mine', 'My requests'],
  ['all', 'All'],
]

const roleLabel = (role) => (role ? role.charAt(0).toUpperCase() + role.slice(1) : '')

function stepName(step) {
  return step.approver || `Any ${roleLabel(step.approver_role)}`
}

function AutoFlow() {
  const t = useT()
  const user = getUser()
  const [workflows, setWorkflows] = useState([])
  const [templates, setTemplates] = useState([])
  const [people, setPeople] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [filter, setFilter] = useState('action')
  const [notes, setNotes] = useState({})
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [list, templateList, peopleList] = await Promise.all([
        api.get('/workflows'),
        api.get('/workflows/templates'),
        api.get('/workflows/people'),
      ])
      setWorkflows(list.data?.data || [])
      setTemplates(templateList.data?.data || [])
      setPeople((peopleList.data?.data || []).filter((person) => person.id !== user?.id))
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load workflows.')
    }
  }, [user?.id])

  useEffect(() => {
    load()
  }, [load])

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const create = async (event) => {
    event.preventDefault()
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      due_at: form.due_at || null,
    }
    if (form.template === 'custom') {
      if (!form.approver_id) return setNotice('Choose an approver for a custom request.')
      payload.approver_id = Number(form.approver_id)
    } else {
      payload.template = form.template
    }
    try {
      await api.post('/workflows', payload)
      setForm(EMPTY_FORM)
      setNotice('Request submitted — the first approver has been notified.')
      setFilter('mine')
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not create the workflow.')
    }
    return undefined
  }

  const decide = async (workflow, status) => {
    try {
      const response = await api.patch(`/workflows/${workflow.id}`, { status, note: notes[workflow.id] || undefined })
      setNotice(response.data?.message || 'Workflow updated.')
      setNotes((current) => ({ ...current, [workflow.id]: '' }))
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not update this workflow.')
    }
  }

  const visible = useMemo(() => {
    if (filter === 'action') return workflows.filter((w) => w.can_decide || w.can_complete)
    if (filter === 'mine') return workflows.filter((w) => w.created_by === user?.id || w.assigned_to === user?.id)
    return workflows
  }, [filter, workflows, user?.id])

  const selectedTemplate = templates.find((template) => template.key === form.template)
  const counts = {
    action: workflows.filter((w) => w.can_decide || w.can_complete).length,
    running: workflows.filter((w) => w.status === 'pending').length,
    done: workflows.filter((w) => ['approved', 'completed'].includes(w.status)).length,
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('WORKFLOW AUTOMATION')}</div>
          <h1>{t('AutoFlow')}</h1>
          <p>{t('Approval chains for purchases, leave, documents and onboarding — each step notifies the next approver.')}</p>
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>{t("Needs my action")}</span><span className="stat-icon">◷</span></div>
          <strong>{counts.action}</strong>
          <small>{t("Waiting for you")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("In progress")}</span><span className="stat-icon">⟳</span></div>
          <strong>{counts.running}</strong>
          <small>{t("Moving through approval")}</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{t("Approved")}</span><span className="stat-icon">✓</span></div>
          <strong>{counts.done}</strong>
          <small>{t("Approved or completed")}</small>
        </div>
      </div>

      {notice && <div className="cloud-notice" role="status">{translateServer(notice)}</div>}

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t("New request")}</h3>
            <p>{t("Pick a process template, or send it to a specific approver.")}</p>
          </div>
        </div>
        <form className="autoflow-form autoflow-form--grid" onSubmit={create}>
          <input value={form.title} onChange={change('title')} placeholder={t("What needs approval?")} required />
          <select value={form.template} onChange={change('template')} aria-label={t("Process")}>
            {templates.map((template) => (
              <option key={template.key} value={template.key}>{template.name}</option>
            ))}
            <option value="custom">{t("Custom — choose an approver")}</option>
          </select>
          {form.template === 'custom' && (
            <select value={form.approver_id} onChange={change('approver_id')} aria-label={t("Approver")} required>
              <option value="">{t("Choose approver…")}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name} ({person.role})</option>
              ))}
            </select>
          )}
          <select value={form.assigned_to} onChange={change('assigned_to')} aria-label={t("Assignee")}>
            <option value="">{t("No assignee")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{t("Assign to")}{" "}{person.name}</option>
            ))}
          </select>
          <label className="autoflow-date">
            {t("Due")}
            <input type="date" value={form.due_at} onChange={change('due_at')} />
          </label>
          <textarea value={form.description} onChange={change('description')} placeholder={t("Details (optional)")} rows="2" />
          {selectedTemplate && (
            <p className="autoflow-chain-hint">
              {t("Approval chain:")}{" "}{selectedTemplate.steps.map(roleLabel).join(' → ')}
            </p>
          )}
          <button type="submit" className="primary-action">{t("＋ Submit request")}</button>
        </form>
      </div>

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t("Requests")}</h3>
            <p>{t("Approve or reject the step that is waiting for you.")}</p>
          </div>
          <div className="autoflow-filters" role="tablist">
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={filter === key}
                className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {visible.length ? (
          <div className="feature-list">
            {visible.map((workflow) => (
              <div className="autoflow-card" key={workflow.id}>
                <div className="autoflow-card-head">
                  <span className="list-item-copy">
                    <strong>{workflow.title}</strong>
                    <span>
                      {workflow.owner || t("System")} · {new Date(workflow.created_at).toLocaleDateString(dateLocale())}
                      {workflow.due_at && ` · ${t('due {date}', { date: new Date(workflow.due_at).toLocaleDateString(dateLocale()) })}`}
                      {workflow.assignee && ` · ${t('assigned to {name}', { name: workflow.assignee })}`}
                    </span>
                  </span>
                  <span className={`item-status autoflow-status-${workflow.status}`}>{workflow.status}</span>
                </div>

                {workflow.description && <p className="autoflow-description">{workflow.description}</p>}

                <ol className="autoflow-steps">
                  {workflow.steps.map((step) => (
                    <li key={step.order} className={`step-${step.status} ${workflow.status === 'pending' && step.order === workflow.current_step ? 'step-current' : ''}`}>
                      <span className="step-dot">{step.status === 'approved' ? '✓' : step.status === 'rejected' ? '✕' : step.order}</span>
                      <span className="step-copy">
                        <strong>{stepName(step)}</strong>
                        <small>
                          {step.status === 'pending'
                            ? (workflow.status === 'pending' && step.order === workflow.current_step ? t("Waiting") : t("Next"))
                            : `${step.status} by ${step.decided_by}${step.note ? ` — “${step.note}”` : ''}`}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>

                {workflow.can_decide && (
                  <div className="autoflow-actions">
                    <input
                      value={notes[workflow.id] || ''}
                      onChange={(event) => setNotes((current) => ({ ...current, [workflow.id]: event.target.value }))}
                      placeholder={t("Comment (optional)")}
                    />
                    <button type="button" onClick={() => decide(workflow, 'approved')}>{t("✓ Approve")}</button>
                    <button type="button" className="cloud-remove" onClick={() => decide(workflow, 'rejected')}>{t("✕ Reject")}</button>
                  </div>
                )}
                {workflow.can_complete && (
                  <div className="autoflow-actions">
                    <button type="button" onClick={() => decide(workflow, 'completed')}>{t("Mark as completed")}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">⟳</div>
            <h3>{filter === 'action' ? t("Nothing waiting for you") : t("No requests yet")}</h3>
            <p>{filter === 'action' ? t("You are all caught up.") : t("Submit a request to start an approval chain.")}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default AutoFlow

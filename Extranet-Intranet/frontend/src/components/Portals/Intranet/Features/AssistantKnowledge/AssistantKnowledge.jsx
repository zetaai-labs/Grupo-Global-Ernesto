import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { dateLocale, useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import './AssistantKnowledge.css'

const TABS = [['knowledge', 'What it knows'], ['unanswered', 'Unanswered questions'], ['contacts', 'Requests to the team']]
const EMPTY = { title: '', content: '', active: true, sort_order: 100 }

/**
 * Staff page for the public "Ask Grupo Global" assistant: the approved facts it answers from, the
 * questions it could not answer (to add what is missing) and visitors' requests to talk to the team.
 */
function AssistantKnowledge() {
  const t = useT()
  const [tab, setTab] = useState('knowledge')
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData((await api.get('/assistant')).data.data)
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message) || t('Could not load this page.'))
    }
  }, [t])
  useEffect(() => { load() }, [load])

  const act = async (work, message) => {
    setBusy(true)
    try {
      await work()
      setNotice(t(message))
      setForm(null)
      await load()
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message) || t('The action could not be completed.'))
    } finally {
      setBusy(false)
    }
  }

  const save = (event) => {
    event.preventDefault()
    const body = { title: form.title, content: form.content, active: form.active, sort_order: Number(form.sort_order) || 100 }
    act(() => (form.entry_id ? api.patch(`/assistant/knowledge/${form.entry_id}`, body) : api.post('/assistant/knowledge', body)), 'Saved.')
  }

  const when = (value) => new Date(value).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })
  const counts = {
    knowledge: data?.knowledge.length,
    unanswered: data?.unanswered.length,
    contacts: data?.contacts.filter((row) => row.status === 'OPEN').length,
  }

  return (
    <section className="feature-page ak">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('ADMINISTRATION')}</div>
          <h1>{t('AI assistant knowledge')}</h1>
          <p>{t('The public assistant answers visitors and members only from these approved facts. Membership prices and the support email are added automatically.')}</p>
        </div>
        {tab === 'knowledge' && <button type="button" className="primary-action" onClick={() => setForm(EMPTY)}>＋ {t('Add a fact')}</button>}
      </div>

      {data && (
        <div className="feature-stats">
          <div className="stat-card"><div className="stat-top"><span>{t('Questions asked')}</span><span className="stat-icon">?</span></div><strong>{data.stats.total}</strong><small>{t('{count} in the last 7 days', { count: data.stats.last_7_days })}</small></div>
          <div className="stat-card"><div className="stat-top"><span>{t('Answered')}</span><span className="stat-icon">✓</span></div><strong>{data.stats.total ? Math.round((data.stats.answered / data.stats.total) * 100) : 0}%</strong><small>{t('Kept {days} days, without names', { days: data.retention_days })}</small></div>
          <div className="stat-card"><div className="stat-top"><span>{t('Mode')}</span><span className="stat-icon">AI</span></div><strong>{t(data.ai ? 'AI answers' : 'Fact matching')}</strong><small>{t(data.ai ? 'Claude writes answers from these facts.' : 'Add the AI key to get written answers in every language.')}</small></div>
        </div>
      )}

      {notice && <div className="cloud-notice zx-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label={t('Dismiss')}>✕</button></div>}

      <div className="zx-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setForm(null) }}>
            {t(label)}{counts[key] ? ` (${counts[key]})` : ''}
          </button>
        ))}
      </div>

      {form && (
        <form className="ak-form feature-panel" onSubmit={save}>
          <label>{t('Title')}<input required maxLength="200" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('For example: Office hours')} /></label>
          <label>{t('Fact (what the assistant may say)')}
            <textarea required maxLength="4000" rows="6" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
            <small>{t('{count} of 4000 characters. Write plain, checked facts: the assistant repeats them to the public.', { count: form.content.length })}</small>
          </label>
          <div className="ak-row">
            <label>{t('Order')}<input type="number" min="0" max="10000" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} /></label>
            <label className="ak-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> {t('In use')}</label>
          </div>
          <div className="zx-form-actions">
            <button type="submit" className="primary-action" disabled={busy}>{t('Save')}</button>
            <button type="button" onClick={() => setForm(null)}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      {data && tab === 'knowledge' && (
        <div className="ak-list">
          {data.knowledge.map((entry) => (
            <article key={entry.entry_id} className={`feature-panel ak-entry ${entry.active ? '' : 'ak-off'}`}>
              <header>
                <strong>{entry.title}</strong>
                {!entry.active && <span className="zx-pill">{t('Not in use')}</span>}
              </header>
              <p>{entry.content}</p>
              <footer>
                <small>{t('Updated {date}', { date: when(entry.updated_at) })}</small>
                <button type="button" className="zx-link" onClick={() => setForm(entry)}>{t('Edit')}</button>
                <button type="button" className="zx-link ak-danger" disabled={busy}
                  onClick={() => { if (window.confirm(t('Delete this fact? The assistant will stop using it.'))) act(() => api.delete(`/assistant/knowledge/${entry.entry_id}`), 'Deleted.') }}>
                  {t('Delete')}
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      {data && tab === 'unanswered' && (
        <div className="zx-table-wrap zx-card">
          <table>
            <thead><tr><th>{t('Question')}</th><th>{t('Language')}</th><th>{t('Times')}</th><th>{t('Last asked')}</th><th /></tr></thead>
            <tbody>
              {data.unanswered.map((row) => (
                <tr key={`${row.question}-${row.language}`}>
                  <td dir="auto">{row.question}</td><td>{String(row.language || '').toUpperCase()}</td><td>{row.times}</td><td>{when(row.last_asked)}</td>
                  <td><button type="button" className="zx-link" onClick={() => { setTab('knowledge'); setForm({ ...EMPTY, title: row.question.slice(0, 200) }) }}>{t('Add the answer')}</button></td>
                </tr>
              ))}
              {!data.unanswered.length && <tr><td colSpan="5" className="zx-empty">{t('Every question so far had an answer.')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'contacts' && (
        <div className="ak-list">
          {data.contacts.map((row) => (
            <article key={row.request_id} className={`feature-panel ak-entry ${row.status === 'OPEN' ? '' : 'ak-off'}`}>
              <header>
                <strong><bdi>{row.name}</bdi>{row.company ? <> · <bdi>{row.company}</bdi></> : ''}</strong>
                <span className={`zx-pill ${row.status === 'OPEN' ? 'zx-expired' : 'zx-accepted'}`}>{t(row.status === 'OPEN' ? 'Waiting for reply' : 'Answered')}</span>
              </header>
              <p dir="auto">{row.question}</p>
              <footer>
                <small>{when(row.created_at)} · {String(row.language || '').toUpperCase()}</small>
                <a className="zx-link" href={`mailto:${row.email}?subject=${encodeURIComponent('Grupo Global')}`}>{t('Reply to {email}', { email: row.email })}</a>
                {row.status === 'OPEN' && (
                  <button type="button" className="zx-link" disabled={busy} onClick={() => act(() => api.post(`/assistant/contacts/${row.request_id}/answered`), 'Marked as answered.')}>{t('Mark as answered')}</button>
                )}
              </footer>
            </article>
          ))}
          {!data.contacts.length && <p className="zx-empty">{t('No requests yet.')}</p>}
        </div>
      )}
    </section>
  )
}

export default AssistantKnowledge

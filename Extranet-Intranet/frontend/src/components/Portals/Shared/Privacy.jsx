import { useCallback, useEffect, useState } from 'react'
import api from '../../../api/client'
import { getUser } from '../../../api/auth'
import { downloadFromApi } from '../../../utils/download'
import { useT, dateLocale } from '../../../i18n'
import './Privacy.css'
import { translateServer } from '../../../i18n/serverMessages'
import ConsentCard from './privacy/ConsentCard'

const TYPE_LABELS = { RECTIFICATION: 'Rectification', CANCELLATION: 'Cancellation (erasure)', OPPOSITION: 'Opposition' }
const TYPE_HELP = {
  RECTIFICATION: 'Correct personal data that is wrong.',
  CANCELLATION: 'Ask us to delete your personal data and close your account.',
  OPPOSITION: 'Object to optional processing, such as appearing in the directory or profiling.',
}
const EMPTY = { request_type: 'RECTIFICATION', field: 'name', requested_value: '', details: '' }

/** GDPR ARCO rights for every user, plus the review queue for HR and the Super Admin. */
function Privacy() {
  const t = useT()
  const user = getUser()
  const isOfficer = ['admin', 'hr'].includes(user?.role)
  const [mine, setMine] = useState({ processing_opposed: false, requests: [] })
  const [queue, setQueue] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [responses, setResponses] = useState({})
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      setMine((await api.get('/privacy/me')).data?.data)
      if (isOfficer) setQueue((await api.get('/privacy/requests')).data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || t('Could not load your privacy data.'))
    }
  }, [isOfficer, t])

  useEffect(() => { load() }, [load])

  const submit = async (event) => {
    event.preventDefault()
    if (form.request_type === 'CANCELLATION' && !window.confirm(t('Request permanent deletion of your personal data and account?'))) return
    try {
      const response = await api.post('/privacy/requests', {
        request_type: form.request_type,
        details: form.details,
        ...(form.request_type === 'RECTIFICATION' ? { field: form.field, requested_value: form.requested_value } : {}),
      })
      setNotice(t(response.data?.message))
      setForm(EMPTY)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || t('Could not send your request.'))
    }
  }

  const decide = async (request, decision) => {
    if (decision === 'APPROVED' && request.request_type === 'CANCELLATION'
      && !window.confirm(t('Permanently erase {name}? This cannot be undone.', { name: request.user_name }))) return
    try {
      const response = await api.post(`/privacy/requests/${request.request_id}/decide`, { decision, response: responses[request.request_id] || '' })
      setNotice(response.data?.message)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || t('Could not record the decision.'))
    }
  }

  const pending = queue.filter((request) => request.status === 'PENDING')

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('DATA PROTECTION')}</div>
          <h1>{t('Privacy (GDPR)')}</h1>
          <p>{t('Exercise your rights of Access, Rectification, Cancellation and Opposition. We respond within one month.')}</p>
        </div>
        <button type="button" className="primary-action"
          onClick={() => downloadFromApi('/privacy/export', 'my-global-group-data.zip').catch(() => setNotice(t('Could not create your export.')))}>
          ⇩ {t('Download my data (ZIP)')}
        </button>
      </div>

      {notice && <div className="cloud-notice prv-notice" role="status"><span>{translateServer(notice)}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss">✕</button></div>}
      {mine.processing_opposed && <div className="prv-flag">{t('Your opposition is active: you are excluded from the directory and optional profiling.')}</div>}

      <div className="prv-grid">
        <form className="feature-panel prv-form" onSubmit={submit}>
          <h3>{t('New request')}</h3>
          <select value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })} aria-label={t('Right')}>
            {Object.entries(TYPE_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
          </select>
          <small>{t(TYPE_HELP[form.request_type])}</small>
          {form.request_type === 'RECTIFICATION' && (
            <>
              <select value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} aria-label={t('Data to correct')}>
                <option value="name">{t('Name')}</option>
                <option value="email">{t('Email')}</option>
                <option value="other">{t('Other')}</option>
              </select>
              <input value={form.requested_value} onChange={(e) => setForm({ ...form, requested_value: e.target.value })} placeholder={t('Correct value')} required />
            </>
          )}
          <textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder={t('Explain your request (at least 10 characters)')} minLength={10} rows="3" required />
          <button type="submit" className="primary-action">{t('Send request')}</button>
        </form>

        <div className="feature-panel">
          <h3 className="prv-title">{t('My requests')}</h3>
          <ul className="prv-list">
            {mine.requests.map((request) => (
              <li key={request.request_id}>
                <strong>{t(TYPE_LABELS[request.request_type])}</strong>
                <span className={`prv-pill prv-${request.status.toLowerCase()}`}>{t(request.status)}</span>
                <p>{request.details}</p>
                {request.response && <small>{t('Response')}: {request.response}</small>}
              </li>
            ))}
            {!mine.requests.length && <li className="prv-muted">{t('No requests yet.')}</li>}
          </ul>
        </div>
      </div>

      <ConsentCard />

      {isOfficer && (
        <div className="feature-panel">
          <h3 className="prv-title">{t('Review queue')} ({pending.length} {t('pending')})</h3>
          <ul className="prv-list">
            {queue.map((request) => (
              <li key={request.request_id}>
                <strong>{request.user_name} · {t(TYPE_LABELS[request.request_type])}</strong>
                <span className={`prv-pill prv-${request.status.toLowerCase()}`}>{t(request.status)}</span>
                <p>{request.details}</p>
                {request.requested_value && <small>{request.field}: {request.requested_value}</small>}
                <small>{t('Respond by')} {new Date(request.due_at).toLocaleDateString(dateLocale())}{request.decided_by_name ? ` · ${request.decided_by_name}` : ''}</small>
                {request.status === 'PENDING' && request.user_id !== user?.id && (
                  <div className="prv-decide">
                    <input value={responses[request.request_id] || ''} onChange={(e) => setResponses({ ...responses, [request.request_id]: e.target.value })} placeholder={t('Response to the person')} aria-label={t('Response to the person')} />
                    <button type="button" onClick={() => decide(request, 'APPROVED')}>{t('Approve')}</button>
                    <button type="button" className="prv-reject" onClick={() => decide(request, 'REJECTED')}>{t('Reject')}</button>
                  </div>
                )}
              </li>
            ))}
            {!queue.length && <li className="prv-muted">{t('No requests yet.')}</li>}
          </ul>
        </div>
      )}
    </section>
  )
}

export default Privacy

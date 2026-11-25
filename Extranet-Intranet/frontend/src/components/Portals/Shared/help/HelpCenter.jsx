import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../../../../api/client'
import { useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import './HelpCenter.css'

const CATEGORIES = [['bug', 'Something is not working'], ['access', 'Access or sign-in'], ['billing', 'Billing or invoices'], ['question', 'A question']]

/** Help & support dialog: how to reach the team, and "Report a problem" (creates a support ticket). Mounted once per portal. */
function HelpCenter() {
  const t = useT()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [contact, setContact] = useState(null)
  const [form, setForm] = useState({ category: 'bug', subject: '', message: '' })
  const [sent, setSent] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const closeRef = useRef(null)

  useEffect(() => {
    const show = () => { setOpen(true); setSent(null); setError('') }
    window.addEventListener('gg:help', show)
    return () => window.removeEventListener('gg:help', show)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    if (!contact) api.get('/support').then((response) => setContact(response.data.data)).catch(() => setContact({ email: 'support@grupoglobal.es' }))
    closeRef.current?.focus()
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, contact])

  if (!open) return null

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await api.post('/support/requests', { ...form, page: location.pathname })
      setSent(response.data.data.ref || '')
      setForm({ category: 'bug', subject: '', message: '' })
    } catch (failure) {
      setError(translateServer(failure.response?.data?.message) || t('The request could not be sent. Write to us by e-mail instead.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hc-overlay" role="presentation" onClick={() => setOpen(false)}>
      <div className="hc-dialog" role="dialog" aria-modal="true" aria-labelledby="hc-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2 id="hc-title">❓ {t('Help & support')}</h2>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={t('Close')}>✕</button>
        </header>

        <section className="hc-contact">
          <h3>{t('Contact the support team')}</h3>
          {contact && (
            <ul>
              <li>✉ <a href={`mailto:${contact.email}?subject=${encodeURIComponent(t('Help with the Global Group platform'))}`}>{contact.email}</a></li>
              {contact.phone && <li>☏ <a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}>{contact.phone}</a></li>}
              <li>◷ {contact.hours || t('Monday to Friday, 9:00–18:00 (Madrid time)')}</li>
            </ul>
          )}
        </section>

        <section>
          <h3>{t('Report a problem')}</h3>
          {sent !== null ? (
            <div className="hc-sent" role="status">
              <strong>✓ {t('Your request was sent.')}</strong>
              {sent && <span>{t('Reference: {ref}', { ref: sent })}</span>}
              <span>{t('The support team will answer you by e-mail or in the app.')}</span>
              <button type="button" onClick={() => setSent(null)}>{t('Send another request')}</button>
            </div>
          ) : (
            <form className="hc-form" onSubmit={submit}>
              <label>{t('What is it about?')}
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
                </select>
              </label>
              <label>{t('Subject')}
                <input required minLength={3} maxLength={150} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </label>
              <label>{t('What happened?')}
                <textarea required minLength={10} maxLength={4000} rows="4" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder={t('What you did, what you expected and what you saw instead.')} />
              </label>
              <small>{t('The page you are on and your browser are added automatically.')}</small>
              {error && <p className="hc-error" role="alert">{error}</p>}
              <button type="submit" className="primary-action" disabled={busy}>{t(busy ? 'Sending…' : 'Send')}</button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}

export default HelpCenter

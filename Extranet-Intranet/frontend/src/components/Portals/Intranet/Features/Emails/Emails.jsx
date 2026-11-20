import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './Emails.css'
import { useT } from '../../../../../i18n'

const EMPTY_FORM = { to: '', subject: '', body: '', in_reply_to: null }

const STATUS_LABELS = {
  delivered: 'Delivered',
  sent: 'Sent',
  received: 'Received',
  partially_sent: 'Partly sent',
  not_sent: 'Not sent',
  failed: 'Failed',
}

function formatDate(value) {
  const date = new Date(value)
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: '2-digit', month: 'short' })
}

function Emails() {
  const t = useT()
  const [folder, setFolder] = useState('inbox')
  const [emails, setEmails] = useState([])
  const [counts, setCounts] = useState({ inbox: 0, unread: 0, sent: 0, undelivered: 0 })
  const [smtp, setSmtp] = useState(false)
  const [selected, setSelected] = useState(null)
  const [composing, setComposing] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async (target) => {
    try {
      const response = await api.get('/emails', { params: { folder: target } })
      setEmails(response.data?.data || [])
      setCounts(response.data?.counts || {})
      setSmtp(Boolean(response.data?.smtp))
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load emails.')
    }
  }, [])

  useEffect(() => {
    load(folder)
  }, [folder, load])

  const open = async (email) => {
    setComposing(false)
    try {
      const response = await api.get(`/emails/${email.id}`)
      setSelected(response.data?.data)
      if (!email.read_at) {
        setEmails((current) => current.map((item) => (item.id === email.id ? { ...item, read_at: new Date().toISOString() } : item)))
        setCounts((current) => ({ ...current, unread: Math.max(0, (current.unread || 0) - 1) }))
      }
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open this email.')
    }
  }

  const compose = (preset = EMPTY_FORM) => {
    setSelected(null)
    setForm(preset)
    setComposing(true)
  }

  const reply = () => {
    if (!selected) return
    const quoted = selected.body.split('\n').map((line) => `> ${line}`).join('\n')
    compose({
      to: selected.folder === 'inbox' ? selected.from_address || '' : selected.to_address,
      subject: selected.subject.startsWith('Re:') ? selected.subject : `Re: ${selected.subject}`,
      body: `\n\nOn ${new Date(selected.created_at).toLocaleString()}, ${selected.from_name || selected.from_address} wrote:\n${quoted}`,
      in_reply_to: selected.id,
    })
  }

  const remove = async () => {
    if (!selected) return
    try {
      await api.delete(`/emails/${selected.id}`)
      setSelected(null)
      await load(folder)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not delete this email.')
    }
  }

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const send = async (event) => {
    event.preventDefault()
    setSending(true)
    try {
      const response = await api.post('/emails', form)
      setNotice(response.data?.message || 'Email sent.')
      setComposing(false)
      setForm(EMPTY_FORM)
      if (folder === 'sent') await load('sent')
      else setFolder('sent')
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not send the email.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('COMMUNICATION')}</div>
          <h1>{t('Emails')}</h1>
          <p>{t('Your private mailbox. Messages to colleagues arrive instantly; external mail uses the company mail server.')}</p>
        </div>
        <button type="button" className="primary-action" onClick={() => compose()}>✎ Compose</button>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>Unread</span><span className="stat-icon">✉</span></div>
          <strong>{counts.unread || 0}</strong>
          <small>of {counts.inbox || 0} in Inbox</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Sent</span><span className="stat-icon">↗</span></div>
          <strong>{counts.sent || 0}</strong>
          <small>Messages you sent</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>External delivery</span><span className="stat-icon">⇄</span></div>
          <strong>{smtp ? 'On' : 'Off'}</strong>
          <small>{smtp ? 'SMTP configured' : 'Internal mail only until SMTP is set'}</small>
        </div>
      </div>

      {notice && (
        <div className="cloud-notice" role="status">
          {notice}
          <button type="button" className="mail-notice-close" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="mailbox">
        <aside className="mailbox-list feature-panel">
          <div className="mailbox-tabs" role="tablist">
            {['inbox', 'sent'].map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={folder === name}
                className={folder === name ? 'active' : ''}
                onClick={() => { setSelected(null); setFolder(name) }}
              >
                {name === 'inbox' ? 'Inbox' : 'Sent'}
                {name === 'inbox' && counts.unread > 0 && <span className="mailbox-badge">{counts.unread}</span>}
              </button>
            ))}
          </div>

          {emails.length ? (
            <div className="mailbox-items">
              {emails.map((email) => (
                <button
                  type="button"
                  key={email.id}
                  className={`mailbox-item ${selected?.id === email.id ? 'selected' : ''} ${folder === 'inbox' && !email.read_at ? 'unread' : ''}`}
                  onClick={() => open(email)}
                >
                  <span className="mailbox-item-top">
                    <strong>{folder === 'inbox' ? (email.from_name || email.from_address) : `To: ${email.to_address}`}</strong>
                    <small>{formatDate(email.created_at)}</small>
                  </span>
                  <span className="mailbox-subject">{email.subject}</span>
                  <span className="mailbox-preview">{email.preview}</span>
                  {folder === 'sent' && email.status !== 'delivered' && email.status !== 'sent' && (
                    <span className={`mailbox-status status-${email.status}`}>{STATUS_LABELS[email.status] || email.status}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="feature-empty-state">
              <div className="empty-icon">✉</div>
              <h3>{folder === 'inbox' ? 'Your inbox is empty' : 'No sent messages'}</h3>
              <p>{folder === 'inbox' ? 'New messages will appear here.' : 'Compose a message to get started.'}</p>
            </div>
          )}
        </aside>

        <div className="mailbox-reader feature-panel">
          {composing && (
            <form className="email-form" onSubmit={send}>
              <h3>{form.in_reply_to ? 'Reply' : 'New message'}</h3>
              <input value={form.to} onChange={change('to')} placeholder="To — e.g. hr@gmail.com, manager@gmail.com" required />
              <input value={form.subject} onChange={change('subject')} placeholder="Subject" required />
              <textarea value={form.body} onChange={change('body')} placeholder="Message" rows="10" required />
              <div className="mail-actions">
                <button type="submit" className="primary-action" disabled={sending}>{sending ? 'Sending…' : '✉ Send'}</button>
                <button type="button" onClick={() => setComposing(false)}>Cancel</button>
              </div>
            </form>
          )}

          {!composing && selected && (
            <article className="mail-view">
              <header>
                <h2>{selected.subject}</h2>
                <div className="mail-meta">
                  <span><strong>From:</strong> {selected.from_name} {selected.from_address && `<${selected.from_address}>`}</span>
                  <span><strong>To:</strong> {selected.to_address}</span>
                  <span><strong>Date:</strong> {new Date(selected.created_at).toLocaleString()}</span>
                  {selected.source === 'imap' && <span className="mail-tag">External mail</span>}
                </div>
              </header>
              <pre className="mail-body">{selected.body}</pre>
              <div className="mail-actions">
                <button type="button" className="primary-action" onClick={reply}>↩ Reply</button>
                <button type="button" onClick={remove}>Delete</button>
              </div>
            </article>
          )}

          {!composing && !selected && (
            <div className="feature-empty-state">
              <div className="empty-icon">✉</div>
              <h3>Select a message</h3>
              <p>Choose an email from the list, or compose a new one.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default Emails

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../../../api/client'
import { useLanguage, useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import './AssistantWidget.css'

const STARTERS = ['What is Grupo Global?', 'How does a company join?', 'How much does membership cost?', 'How do I pay?']
const SMALL_TALK = {
  GREETING: 'Hello! How can I help you? You can ask about Grupo Global, membership, payments or how to join.',
  THANKS: 'You’re welcome! Is there anything else I can help you with?',
  BYE: 'Goodbye! Come back any time if you have more questions.',
}

/**
 * "Ask Grupo Global": the public assistant for visitors and members. It answers from the knowledge staff
 * approve; when it cannot, it offers to pass the question to the team.
 * `raised` lifts the button above the bottom toolbar inside the portal.
 */
function AssistantWidget({ raised = false }) {
  const t = useT()
  const language = useLanguage()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [contact, setContact] = useState(null)
  const [sent, setSent] = useState('')
  const list = useRef(null)
  const input = useRef(null)

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight
  }, [messages, contact, sent])
  useEffect(() => {
    if (!open) return undefined
    input.current?.focus()
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // `topic` is the English wording of a suggested question: it lets the no-AI matching work in any language.
  const ask = async (question, topic) => {
    const clean = question.trim()
    if (!clean || busy) return
    setText('')
    setContact(null)
    setSent('')
    const history = messages.slice(-6).map((item) => ({ role: item.role, text: item.text.slice(0, 1500) }))
    setMessages((current) => [...current, { role: 'user', text: clean }])
    setBusy(true)
    try {
      const response = await api.post('/public/assistant/ask', { question: clean, language, history, ...(topic ? { topic } : {}) })
      const data = response.data.data
      const fallback = !data.answered && !data.answer
      setMessages((current) => [...current, {
        role: 'assistant',
        text: data.smalltalk ? t(SMALL_TALK[data.smalltalk]) : fallback ? t('I don’t have that information yet. The team can answer you by email.') : data.answer,
        next: data.answered ? data.next : 'CONTACT',
        english: data.mode === 'faq' && data.answer && language !== 'en',
        question: clean,
      }])
    } catch (error) {
      setMessages((current) => [...current, {
        role: 'assistant', text: translateServer(error.response?.data?.message) || t('The assistant could not answer right now.'), next: 'CONTACT', question: clean,
      }])
    } finally {
      setBusy(false)
    }
  }

  const sendContact = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await api.post('/public/assistant/contact', { ...contact, language })
      setSent(translateServer(response.data.message))
      setContact(null)
    } catch (error) {
      setContact((current) => ({ ...current, error: translateServer(error.response?.data?.message) || t('Your message could not be sent.') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`aw ${raised ? 'aw-raised' : ''}`}>
      {open && (
        <section className="aw-panel" role="dialog" aria-label={t('Ask Grupo Global')}>
          <header>
            <div>
              <strong>{t('Ask Grupo Global')}</strong>
              <small>{t('Answers from Grupo Global’s approved information')}</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('Close')}>✕</button>
          </header>

          <div className="aw-list" ref={list} aria-live="polite">
            {!messages.length && (
              <div className="aw-welcome">
                <p>{t('Hello! I can answer questions about Grupo Global, membership and how to join.')}</p>
                <div className="aw-starters">
                  {STARTERS.map((starter) => <button key={starter} type="button" onClick={() => ask(t(starter), starter)}>{t(starter)}</button>)}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`aw-msg aw-${message.role}`}>
                <p dir="auto">{message.text}</p>
                {message.english && <small>{t('Shown in English: the full assistant is not switched on yet.')}</small>}
                {message.role === 'assistant' && index === messages.length - 1 && (
                  <div className="aw-next">
                    {message.next === 'REGISTER' && <Link to="/onboarding" onClick={() => setOpen(false)}>{t('Register your organisation')}</Link>}
                    {message.next === 'SIGN_IN' && <Link to="/login" onClick={() => setOpen(false)}>{t('Sign In')}</Link>}
                    {(message.next === 'CONTACT' || message.next === 'REGISTER') && !contact && !sent && (
                      <button type="button" onClick={() => setContact({ name: '', email: '', company: '', question: message.question, consent: false })}>{t('Talk to the team')}</button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && !contact && <div className="aw-msg aw-assistant aw-typing" aria-label={t('Writing…')}><span /><span /><span /></div>}

            {contact && (
              <form className="aw-contact" onSubmit={sendContact}>
                <strong>{t('Talk to the team')}</strong>
                <input required minLength="2" maxLength="150" placeholder={t('Your name')} value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} />
                <input required type="email" maxLength="255" placeholder={t('Your email')} value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} />
                <input maxLength="255" placeholder={t('Company (optional)')} value={contact.company} onChange={(event) => setContact({ ...contact, company: event.target.value })} />
                <textarea required minLength="5" maxLength="2000" rows="3" value={contact.question} onChange={(event) => setContact({ ...contact, question: event.target.value })} />
                <label>
                  <input type="checkbox" checked={contact.consent} onChange={(event) => setContact({ ...contact, consent: event.target.checked })} required />
                  <span>{t('Grupo Global may use my name and email to answer this question.')} <Link to="/legal/privacy" target="_blank" rel="noopener">{t('Privacy policy')}</Link></span>
                </label>
                {contact.error && <p className="aw-error" role="alert">{contact.error}</p>}
                <div><button type="button" onClick={() => setContact(null)}>{t('Cancel')}</button><button type="submit" disabled={busy}>{t('Send')}</button></div>
              </form>
            )}
            {sent && <p className="aw-sent" role="status">{sent}</p>}
          </div>

          <form className="aw-input" onSubmit={(event) => { event.preventDefault(); ask(text) }}>
            <input ref={input} value={text} onChange={(event) => setText(event.target.value)} maxLength="500" placeholder={t('Type your question…')} aria-label={t('Your question')} dir="auto" />
            <button type="submit" disabled={busy || !text.trim()} aria-label={t('Send')}>➤</button>
          </form>
          <small className="aw-note">{t('Automatic answers can be incomplete. Do not share passwords or card numbers.')}</small>
        </section>
      )}
      <button type="button" className="aw-launcher" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span aria-hidden="true">{open ? '✕' : '💬'}</span>
        {!open && <span className="aw-launcher-text">{t('Ask us')}</span>}
      </button>
    </div>
  )
}

export default AssistantWidget

import { useEffect, useState, useSyncExternalStore } from 'react'
import api from '../../../../api/client'
import { getUser } from '../../../../api/auth'
import { dateLocale, useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import { createIdentity, decryptMessage, encryptMessage, fingerprint, parseMessage, unlockIdentity } from './e2ee'
import { getUnlocked, loadPublicKeys, onUnlockChange, setUnlocked, sharedKey } from './privateSession'
import './PrivateChat.css'

const MIN_PASSPHRASE = 10
const time = (value) => new Date(value).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })

/** Set up, unlock or reset the passphrase that protects my private-chat key. */
function PassphraseGate({ identity, onReady }) {
  const t = useT()
  const [mode, setMode] = useState(identity ? 'unlock' : 'setup')
  const [pass, setPass] = useState('')
  const [repeat, setRepeat] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (mode === 'unlock') {
      setBusy(true)
      const privateKey = await unlockIdentity(identity, pass)
      setBusy(false)
      if (!privateKey) return setError(t('That passphrase is not correct.'))
      setUnlocked({ keyId: identity.key_id, privateKey })
      return onReady()
    }
    if (pass.length < MIN_PASSPHRASE) return setError(t('Use at least {n} characters.', { n: MIN_PASSPHRASE }))
    if (pass !== repeat) return setError(t('The two passphrases do not match.'))
    setBusy(true)
    try {
      const created = await createIdentity(pass)
      const response = await api.post('/chat/e2ee/me', { ...created, replace: mode === 'reset' })
      const privateKey = await unlockIdentity(created, pass)
      setUnlocked({ keyId: response.data.data.key_id, privateKey })
      onReady()
    } catch (err) {
      setError(translateServer(err.response?.data?.message) || t('Private chat could not be set up. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="pc-gate" onSubmit={submit}>
      <span className="pc-lock" aria-hidden="true">🔒</span>
      <h3>{t(mode === 'unlock' ? 'Unlock private chat' : mode === 'reset' ? 'Reset your passphrase' : 'Turn on private chat')}</h3>
      <p>{t(mode === 'unlock'
        ? 'Enter your private-chat passphrase. It stays in this browser tab and is never sent to the server.'
        : 'Private chats are end-to-end encrypted: only you and the other person can read them — not Grupo Global, not the administrators, not Zeta AI Labs.')}</p>
      {mode !== 'unlock' && (
        <p className="pc-warn">{t(mode === 'reset'
          ? 'A new passphrase makes your earlier private messages unreadable for you. The other people can still read them.'
          : 'If you forget this passphrase, nobody can recover your private messages. Write it down somewhere safe.')}</p>
      )}
      <input type="password" autoComplete={mode === 'unlock' ? 'current-password' : 'new-password'} value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t('Passphrase')} aria-label={t('Passphrase')} required />
      {mode !== 'unlock' && (
        <>
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} placeholder={t('Repeat the passphrase')} aria-label={t('Repeat the passphrase')} required />
          <label className="pc-check"><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} required /> {t('I understand that a forgotten passphrase cannot be recovered.')}</label>
        </>
      )}
      {error && <p className="pc-error" role="alert">{error}</p>}
      <div className="pc-actions">
        {mode === 'unlock' && <button type="button" className="pc-link" onClick={() => { setMode('reset'); setPass(''); setError('') }}>{t('Forgot your passphrase?')}</button>}
        {mode === 'reset' && <button type="button" className="pc-link" onClick={() => { setMode('unlock'); setPass(''); setError('') }}>{t('Back')}</button>}
        <button type="submit" className="primary-action" disabled={busy}>{busy ? t('Working…') : t(mode === 'unlock' ? 'Unlock' : mode === 'reset' ? 'Reset and unlock' : 'Turn on')}</button>
      </div>
    </form>
  )
}

/** One end-to-end encrypted conversation: messages are decrypted and encrypted in this browser only. */
function PrivateChatView({ conversation, messages, onSent }) {
  const t = useT()
  const user = getUser()
  const unlockedState = useSyncExternalStore(onUnlockChange, getUnlocked)
  const [identity, setIdentity] = useState(undefined)
  const [plain, setPlain] = useState({})
  const [draft, setDraft] = useState('')
  const [codes, setCodes] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/chat/e2ee/me').then((response) => setIdentity(response.data.data.current || null)).catch(() => setIdentity(null))
  }, [unlockedState])

  // Decrypt every message I have not read yet (results are kept per message id).
  useEffect(() => {
    if (!unlockedState) return undefined
    let alive = true
    ;(async () => {
      const todo = messages.filter((item) => !(item.id in plain))
      if (!todo.length) return
      const parsed = todo.map((item) => [item, parseMessage(item.body)])
      await loadPublicKeys(parsed.flatMap(([, p]) => (p ? [p.senderKeyId, p.recipientKeyId] : [])))
      const next = {}
      for (const [item, p] of parsed) {
        if (!p) { next[item.id] = { error: 'not-encrypted' }; continue }
        const mineIsSender = String(item.user_id) === String(user?.id)
        const myKeyId = mineIsSender ? p.senderKeyId : p.recipientKeyId
        const theirKeyId = mineIsSender ? p.recipientKeyId : p.senderKeyId
        if (myKeyId !== unlockedState.keyId) { next[item.id] = { error: 'old-key' }; continue }
        const key = await sharedKey(conversation.id, theirKeyId)
        const text = key ? await decryptMessage(await key, p, conversation.id) : null
        next[item.id] = text === null ? { error: 'unreadable' } : { text }
      }
      if (alive) setPlain((current) => ({ ...current, ...next }))
    })()
    return () => { alive = false }
  }, [messages, unlockedState, conversation.id, plain, user?.id])

  const showCodes = async () => {
    if (codes) return setCodes(null)
    const keys = await loadPublicKeys([unlockedState.keyId, conversation.with_key_id])
    return setCodes({ mine: await fingerprint(keys.get(unlockedState.keyId)), theirs: await fingerprint(keys.get(conversation.with_key_id)) })
  }

  const send = async (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !conversation.with_key_id) return
    setError('')
    try {
      const key = await sharedKey(conversation.id, conversation.with_key_id)
      const body = await encryptMessage(await key, text, conversation.id, unlockedState.keyId, conversation.with_key_id)
      const response = await api.post(`/chat/conversations/${conversation.id}/messages`, { body })
      setPlain((current) => ({ ...current, [response.data.data.id]: { text } }))
      setDraft('')
      onSent(response.data.data)
    } catch (err) {
      setError(translateServer(err.response?.data?.message) || t('The message could not be sent.'))
    }
  }

  const header = (
    <div className="chat-conversation-header">
      <div className="chat-avatar">🔒</div>
      <div>
        <strong><bdi>{conversation.with_name || t('Private chat')}</bdi></strong>
        <span className="pc-badge">{t('End-to-end encrypted')}</span>
      </div>
      {unlockedState && conversation.with_key_id && <button type="button" className="pc-link pc-verify" onClick={showCodes}>{t(codes ? 'Hide security codes' : 'Verify security codes')}</button>}
    </div>
  )

  if (identity === undefined) return <>{header}<div className="page-loading" role="status" aria-live="polite" /></>
  if (!identity || !unlockedState || unlockedState.keyId !== identity.key_id) {
    return <>{header}<PassphraseGate key={identity?.key_id || 'new'} identity={identity} onReady={() => setPlain({})} /></>
  }

  return (
    <>
      {header}
      {codes && (
        <div className="pc-codes">
          <p>{t('Compare these codes with {name} by phone or in person. If they match, nobody is in the middle.', { name: conversation.with_name })}</p>
          <div><small>{t('Your code')}</small><code>{codes.mine}</code></div>
          <div><small>{t('{name}’s code', { name: conversation.with_name })}</small><code>{codes.theirs}</code></div>
        </div>
      )}
      <div className="chat-messages">
        {messages.map((item) => {
          const shown = plain[item.id]
          const mine = String(item.user_id) === String(user?.id)
          return (
            <div key={item.id} className={`chat-message ${mine ? 'sent' : 'received'}`}>
              <span className="chat-sender">{item.sender_name}</span>
              {shown?.text !== undefined ? <p dir="auto">{shown.text}</p> : (
                <p className="pc-locked">🔒 {t(shown?.error === 'old-key'
                  ? 'Sent before your passphrase was reset: it cannot be read any more.'
                  : shown?.error ? 'This message cannot be read.' : 'Decrypting…')}</p>
              )}
              <small>{time(item.created_at)}</small>
            </div>
          )
        })}
        {!messages.length && <p className="chat-empty">{t('Messages here are end-to-end encrypted. Say hello!')}</p>}
      </div>
      {error && <p className="pc-error" role="alert">{error}</p>}
      {conversation.with_key_id ? (
        <form className="chat-input-area" onSubmit={send}>
          <input value={draft} maxLength="8000" onChange={(event) => setDraft(event.target.value)} placeholder={t('Write a private message…')} dir="auto" />
          <button type="submit">{t('Send ↗')}</button>
        </form>
      ) : (
        <p className="pc-waiting">{t('{name} has not turned on private chat yet. They will be able to read messages once they do.', { name: conversation.with_name })}</p>
      )}
    </>
  )
}

export default PrivateChatView

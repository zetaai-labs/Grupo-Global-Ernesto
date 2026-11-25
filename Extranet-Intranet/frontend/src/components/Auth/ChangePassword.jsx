import { useState } from 'react'
import api from '../../api/client'
import { clearSession, getToken, saveSession } from '../../api/auth'
import { useT } from '../../i18n'
import { translateServer } from '../../i18n/serverMessages'

function ChangePassword() {
  const t = useT()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (next !== repeat) {
      setMessage(t('The new passwords do not match.'))
      return
    }
    setBusy(true)
    try {
      const response = await api.post('/auth/password', { current_password: current, new_password: next })
      const remembered = typeof window !== 'undefined' && window.localStorage.getItem('gg_token') === getToken()
      if (response.data?.data?.token) saveSession(response.data.data.token, response.data.data.user, remembered)
      setMessage(t('Password changed. Other devices have been signed out.'))
      setCurrent('')
      setNext('')
      setRepeat('')
    } catch (error) {
      setMessage(t(error.response?.data?.message || 'The action could not be completed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="feature-panel">
      <div className="panel-heading"><div><h3>{t('Change password')}</h3><p>{t('Use at least 12 characters. Do not reuse a password from another site.')}</p></div></div>
      <form className="reset-card" style={{ boxShadow: 'none', maxWidth: '100%', display: 'grid', gap: 8 }} onSubmit={submit}>
        {message && <p role="status">{translateServer(message)}</p>}
        <input type="password" required value={current} onChange={(event) => setCurrent(event.target.value)} placeholder={t('Your current password')} autoComplete="current-password" aria-label={t('Your current password')} />
        <input type="password" required minLength={12} maxLength={200} value={next} onChange={(event) => setNext(event.target.value)} placeholder={t('New password')} autoComplete="new-password" aria-label={t('New password')} />
        <input type="password" required minLength={12} maxLength={200} value={repeat} onChange={(event) => setRepeat(event.target.value)} placeholder={t('Repeat the new password')} autoComplete="new-password" aria-label={t('Repeat the new password')} />
        <button type="submit" className="primary-action" disabled={busy}>{t('Change password')}</button>
        <button
          type="button"
          className="secondary-action"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(t('Sign out on every device, including this one?'))) return
            await api.post('/auth/logout-everywhere').catch(() => {})
            clearSession()
            window.location.assign('/login')
          }}
        >{t('Sign out everywhere')}</button>
      </form>
    </div>
  )
}

export default ChangePassword

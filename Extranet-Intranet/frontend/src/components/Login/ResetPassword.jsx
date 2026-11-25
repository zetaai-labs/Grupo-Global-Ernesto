import { useT } from '../../i18n'
import LanguageSwitch from '../../i18n/LanguageSwitch'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import './Login.css'
import { translateServer } from '../../i18n/serverMessages'

function ResetPassword() {
  const t = useT()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [devToken, setDevToken] = useState('')

  const requestLink = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await api.post('/auth/password-reset/request', { email })
      setNotice(t(response.data?.message || 'Check your inbox for a reset link.'))
      // Only returned by the backend in development when SMTP is not configured.
      if (response.data?.token) setDevToken(response.data.token)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not request a reset link.')
    } finally {
      setLoading(false)
    }
  }

  const setNewPassword = async (event) => {
    event.preventDefault()
    if (password.length < 8) return setError(t('Password must be at least 8 characters.'))
    if (password !== confirm) return setError(t('Passwords do not match.'))
    setLoading(true)
    setError('')
    try {
      const response = await api.post('/auth/password-reset/confirm', { token, new_password: password })
      setNotice(t(response.data?.message || 'Password updated. You can sign in now.'))
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset the password.')
    } finally {
      setLoading(false)
    }
    return undefined
  }

  return (
    <main className="login-page login-page--single">
      <LanguageSwitch className="language-switch--login" />
      <section className="login-form-side">
        <div className="login-card">
          <h2>{token ? t('Choose a new password') : t('Reset your password')}</h2>
          <p className="login-subtitle">
            {token
              ? t('Enter a new password for your Global Group account.')
              : t('Enter your email and we will send you a reset link.')}
          </p>

          {error && <div className="login-error">{translateServer(error)}</div>}
          {notice && <div className="login-notice">{translateServer(notice)}</div>}

          {!notice && !token && (
            <form onSubmit={requestLink} className="login-form">
              <div className="login-field">
                <label htmlFor="reset-email">{t('Email Address')}</label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('Enter your email address')}
                />
              </div>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? t('Sending…') : t('Send reset link')}
              </button>
            </form>
          )}

          {devToken && (
            <p className="login-subtitle">
              {t('Development mode (no SMTP):')}{' '}
              <Link to={`/reset-password?token=${devToken}`} onClick={() => { setNotice(''); setDevToken('') }}>
                {t('open the reset link')}
              </Link>
            </p>
          )}

          {!notice && token && (
            <form onSubmit={setNewPassword} className="login-form">
              <div className="login-field">
                <label htmlFor="reset-password">{t('New password')}</label>
                <input
                  id="reset-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="login-field">
                <label htmlFor="reset-confirm">{t('Confirm password')}</label>
                <input
                  id="reset-confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? t('Saving…') : t('Update password')}
              </button>
            </form>
          )}

          <div className="login-help-divider">
            <span /> <Link to="/login" className="login-forgot">{t('Back to sign in')}</Link> <span />
          </div>
        </div>
      </section>
    </main>
  )
}

export default ResetPassword

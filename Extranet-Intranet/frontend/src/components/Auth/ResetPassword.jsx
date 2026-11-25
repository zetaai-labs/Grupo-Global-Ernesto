import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import './ResetPassword.css'
import { useT } from '../../i18n'
import { translateServer } from '../../i18n/serverMessages'

function ResetPassword() {
  const t = useT()
  const [step, setStep] = useState('request')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const request = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const response = await api.post('/auth/password-reset/request', { email })
      setNotice(response.data?.token ? `Dev token: ${response.data.token}` : response.data?.message)
      if (response.data?.token) {
        setToken(response.data.token)
        setStep('confirm')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not request a reset token.')
    }
  }

  const confirm = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const response = await api.post('/auth/password-reset/confirm', { token, new_password: password })
      setNotice(response.data?.message)
      setStep('done')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset the password.')
    }
  }

  return (
    <main className="reset-page">
      <div className="reset-card">
        <h1>{t("Reset password")}</h1>
        {error && <div className="cloud-notice">{translateServer(error)}</div>}
        {notice && <div className="public-upload-success">{translateServer(notice)}</div>}

        {step === 'request' && (
          <form onSubmit={request}>
            <label>{t("Email address")}
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <button type="submit" className="primary-action">{t("Request reset token")}</button>
          </form>
        )}

        {step === 'confirm' && (
          <form onSubmit={confirm}>
            <label>{t("Reset token")}
              <input value={token} onChange={(event) => setToken(event.target.value)} required />
            </label>
            <label>{t("New password")}
              <input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button type="submit" className="primary-action">{t("Set new password")}</button>
          </form>
        )}

        {step === 'done' && <Link to="/login">{t("Return to sign in")}</Link>}
      </div>
    </main>
  )
}

export default ResetPassword

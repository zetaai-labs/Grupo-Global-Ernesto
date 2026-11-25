import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import { useT, dateLocale } from '../../i18n'
import LanguageSwitch from '../../i18n/LanguageSwitch'
import './ReceivedFileUpload.css'
import './Onboarding.css'
import { translateServer } from '../../i18n/serverMessages'

/** Public page: checks a certificate's SHA-256 code against the platform's records. */
function VerifyCertificate() {
  const t = useT()
  const [searchParams] = useSearchParams()
  const [code, setCode] = useState(searchParams.get('code') || '')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const verify = useCallback(async (value) => {
    setResult(null)
    setError('')
    const clean = value.trim().toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(clean)) {
      setError(t('Enter the 64-character certificate code.'))
      return
    }
    try {
      const response = await api.get(`/public/certificates/${clean}`)
      setResult(response.data?.data)
    } catch (err) {
      if (err.response?.status === 404) setResult({ valid: false })
      else setError(t('Could not check this certificate. Try again later.'))
    }
  }, [t])

  useEffect(() => {
    const initial = searchParams.get('code')
    if (initial) verify(initial)
  }, [searchParams, verify])

  return (
    <main className="public-upload-page onboarding-page">
      <LanguageSwitch className="language-switch--login" />
      <div className="public-upload-card">
        <div className="feature-eyebrow">{t('CERTIFICATE VERIFICATION')}</div>
        <h1>{t('Verify a certificate')}</h1>
        <p>{t('Check that a Global Group training certificate is genuine.')}</p>

        {error && <div className="cloud-notice" role="alert">{translateServer(error)}</div>}

        <form onSubmit={(event) => { event.preventDefault(); verify(code) }}>
          <label>{t('Certificate code (SHA-256)')}
            <input value={code} onChange={(event) => setCode(event.target.value)} required spellCheck={false} />
          </label>
          <button type="submit" className="primary-action">{t('Verify')}</button>
        </form>

        {result?.valid && (
          <div className="onboarding-check ok" style={{ marginTop: 16 }} role="status">
            <strong>✓ {t('Valid certificate')}</strong>
            <span>{t('Holder')}: {result.holder}</span>
            <span>{t('Course')}: {result.course}</span>
            <span>{t('Score')}: {result.score}%</span>
            <span>{t('Completed')}: {new Date(result.completed_at).toLocaleDateString(dateLocale())}</span>
          </div>
        )}
        {result && !result.valid && (
          <div className="onboarding-check bad" style={{ marginTop: 16 }} role="status">
            <strong>✕ {t('Certificate not found')}</strong>
            <span>{t('This code does not match any certificate issued by Global Group.')}</span>
          </div>
        )}
      </div>
    </main>
  )
}

export default VerifyCertificate

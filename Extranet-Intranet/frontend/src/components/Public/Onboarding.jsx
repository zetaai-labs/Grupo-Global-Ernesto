import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import { useLanguage, useT } from '../../i18n'
import LanguageSwitch from '../../i18n/LanguageSwitch'
import OnboardingPeople from './OnboardingPeople'
import OnboardingMembership from './OnboardingMembership'
import './ReceivedFileUpload.css'
import './Onboarding.css'
import { translateServer } from '../../i18n/serverMessages'
import AssistantWidget from '../Portals/Shared/assistant/AssistantWidget'

const CORRIDORS = [
  ['SPAIN_EU', 'Spain / European Union'],
  ['INDIA', 'India'],
  ['UAE_DUBAI', 'UAE / Dubai'],
  ['LATAM', 'Latin America'],
  ['USA_CAN', 'United States & Canada'],
  ['MOROCCO', 'Morocco'],
]
const ORG_TYPES = [
  ['CLIENT', 'Client company'],
  ['STRATEGIC_PARTNER', 'Strategic partner'],
  ['VENDOR', 'Vendor / supplier'],
  ['INVESTOR', 'Investor / fund'],
  ['DELEGATION_NODE', 'International delegation'],
]
const DOCUMENTS = [
  ['INCORPORATION_CERTIFICATE', 'Incorporation certificate', true],
  ['LEGAL_REPRESENTATION', 'Proof of legal representation', true],
  ['DIRECTOR_ID', 'Director identity document', true],
  ['OPERATING_LICENSE', 'Operating licence', false],
]
const SECTORS = [
  ['FINTECH', 'Fintech'], ['REAL_ESTATE', 'Real estate'], ['HEALTHCARE', 'Healthcare'],
  ['CYBERSECURITY', 'Cybersecurity'], ['CROSS_BORDER_TRADE', 'Cross-border trade'],
]
const STAGES = ['Pre-registration', 'Legal documents', 'Automatic validation', 'AML / PEP screening', 'Approval & credentials']
const EMPTY = {
  legal_name: '', tax_id: '', pic_code: '', country: 'ESP', region_corridor: 'SPAIN_EU', org_type: 'CLIENT',
  contact_name: '', contact_email: '', contact_phone: '', sectors: [], privacy_accepted: false,
  membership_track: 'MEMBER', membership_plan_code: '', billing_address: '', survey: {},
}

/** Public KYC/KYB onboarding (Schema Document §2.4): steps 1–3 for applicants, no account required. */
function Onboarding() {
  const t = useT()
  const language = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('ref')

  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadStatus = useCallback(async () => {
    if (!token) return
    try {
      const response = await api.get(`/public/onboarding/${token}`)
      setStatus(response.data?.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Application not found. Check your link.')
    }
  }, [token])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const register = async (event) => {
    event.preventDefault()
    setBusy('register')
    setError('')
    try {
      const response = await api.post('/public/onboarding', {
        ...form,
        country: form.country.trim().toUpperCase(),
        pic_code: form.pic_code || null,
        contact_phone: form.contact_phone || null,
        language,
        membership_plan_code: form.membership_track === 'MEMBER' ? form.membership_plan_code || null : null,
        billing_address: form.membership_track === 'MEMBER' ? form.billing_address : null,
        survey: Object.fromEntries(Object.entries(form.survey).filter(([, value]) => (Array.isArray(value) ? value.length : String(value).trim()))),
      })
      setNotice(t('Registration received. Save this page’s link to continue later.'))
      navigate(`/onboarding?ref=${response.data.data.token}`, { replace: true })
    } catch (err) {
      setError(t(err.response?.data?.message || 'Registration failed. Please check the form.'))
    } finally {
      setBusy('')
    }
  }

  const uploadDocument = async (docType, file) => {
    if (!file) return
    setBusy(docType)
    setError('')
    const data = new FormData()
    data.append('doc_type', docType)
    data.append('file', file)
    try {
      await api.post(`/public/onboarding/${token}/documents`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
      await loadStatus()
    } catch (err) {
      setError(t(err.response?.data?.message || 'Upload failed. Use PDF, Word or image files up to 25 MB.'))
    } finally {
      setBusy('')
    }
  }

  const submit = async () => {
    setBusy('submit')
    setError('')
    try {
      const response = await api.post(`/public/onboarding/${token}/submit`)
      setNotice(t(response.data?.message))
      await loadStatus()
    } catch (err) {
      setError(t(err.response?.data?.message || 'Could not submit the application.'))
    } finally {
      setBusy('')
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice(t('Link copied. Keep it private — anyone with it can upload documents to your application.'))
    } catch {
      setNotice(window.location.href)
    }
  }

  const uploaded = new Set((status?.documents || []).map((doc) => doc.doc_type))
  const canEdit = status && status.verification_status === 'PENDING' && status.onboarding_stage <= 3

  return (
    <main className="public-upload-page onboarding-page">
      <LanguageSwitch className="language-switch--login" />
      <div className="public-upload-card onboarding-card">
        <div className="feature-eyebrow">{t('KYC / KYB VERIFICATION')}</div>
        <h1>{t('Register your organisation')}</h1>
        <p>{t('Join the Grupo Global ecosystem. Every organisation is verified in 5 steps to meet EU anti-money-laundering rules.')}</p>

        <ol className="onboarding-stages" aria-label={t('Verification steps')}>
          {STAGES.map((label, index) => {
            const step = index + 1
            const current = status ? status.onboarding_stage : 1
            const state = status?.verification_status === 'VERIFIED' || step < current ? 'done' : step === current ? 'current' : ''
            return <li key={label} className={state}><span>{state === 'done' ? '✓' : step}</span>{t(label)}</li>
          })}
        </ol>

        {error && <div className="cloud-notice" role="alert">{translateServer(error)}</div>}
        {notice && <div className="public-upload-success" role="status">{translateServer(notice)}</div>}

        {!token && (
          <form onSubmit={register} className="onboarding-form">
            <h2>{t('1. Organisation details')}</h2>
            <label>{t('Legal name')}
              <input value={form.legal_name} onChange={change('legal_name')} required placeholder="Iberia Retail S.L." />
            </label>
            <div className="onboarding-grid">
              <label>{t('Tax ID (NIF / VAT / PAN)')}
                <input value={form.tax_id} onChange={change('tax_id')} required placeholder="B12345678" />
              </label>
              <label>{t('EU PIC (optional, 9 digits)')}
                <input value={form.pic_code} onChange={change('pic_code')} inputMode="numeric" placeholder="861161733" />
              </label>
              <label>{t('Country (ISO 3)')}
                <input value={form.country} onChange={change('country')} required maxLength={3} placeholder="ESP" />
              </label>
              <label>{t('Corridor')}
                <select value={form.region_corridor} onChange={change('region_corridor')}>
                  {CORRIDORS.map(([code, name]) => <option key={code} value={code}>{t(name)}</option>)}
                </select>
              </label>
              <label>{t('Organisation type')}
                <select value={form.org_type} onChange={change('org_type')}>
                  {ORG_TYPES.map(([code, name]) => <option key={code} value={code}>{t(name)}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="onboarding-sectors">
              <legend>{t('Sectors you work in (optional)')}</legend>
              {SECTORS.map(([code, label]) => (
                <label key={code}>
                  <input
                    type="checkbox"
                    checked={form.sectors.includes(code)}
                    onChange={(event) => setForm((current) => ({ ...current, sectors: event.target.checked ? [...current.sectors, code] : current.sectors.filter((item) => item !== code) }))}
                  />
                  {t(label)}
                </label>
              ))}
            </fieldset>
            <OnboardingMembership form={form} setForm={setForm} />
            <h2>{t('3. Primary contact')}</h2>
            <div className="onboarding-grid">
              <label>{t('Full name')}
                <input value={form.contact_name} onChange={change('contact_name')} required />
              </label>
              <label>{t('Email')}
                <input type="email" value={form.contact_email} onChange={change('contact_email')} required placeholder="you@company.com" />
              </label>
              <label>{t('Phone (optional)')}
                <input value={form.contact_phone} onChange={change('contact_phone')} />
              </label>
            </div>
            <label className="onboarding-consent">
              <input type="checkbox" checked={form.privacy_accepted} onChange={(event) => setForm((current) => ({ ...current, privacy_accepted: event.target.checked }))} required />
              <span>
                {t('I have read and accept the privacy policy, the terms of use and the cookie policy.')}{' '}
                <Link to="/legal/privacy" target="_blank" rel="noopener">{t('Privacy policy')}</Link>
                {' · '}<Link to="/legal/terms" target="_blank" rel="noopener">{t('Terms of use')}</Link>
              </span>
            </label>
            <button type="submit" className="primary-action" disabled={busy === 'register' || !form.privacy_accepted}>
              {busy === 'register' ? t('Registering…') : t('Continue to documents')}
            </button>
          </form>
        )}

        {token && status && (
          <div className="onboarding-status">
            <div className="onboarding-summary">
              <strong>{status.legal_name}</strong>
              <span className={`onboarding-pill onboarding-${status.verification_status.toLowerCase()}`}>{t(status.verification_status)}</span>
              <button type="button" onClick={copyLink}>{t('Copy private link')}</button>
            </div>

            <h2>{t('2. Legal documents')}</h2>
            <ul className="onboarding-docs">
              {DOCUMENTS.map(([code, label, required]) => (
                <li key={code} className={uploaded.has(code) ? 'uploaded' : ''}>
                  <span>
                    <strong>{uploaded.has(code) ? '✓ ' : ''}{t(label)}</strong>
                    <small>{required ? t('Required') : t('Optional')}</small>
                  </span>
                  {canEdit && (
                    <label className="onboarding-file">
                      {busy === code ? t('Uploading…') : uploaded.has(code) ? t('Replace') : t('Upload')}
                      <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(event) => uploadDocument(code, event.target.files?.[0])} />
                    </label>
                  )}
                </li>
              ))}
            </ul>

            <OnboardingPeople token={token} people={status.people || []} canEdit={canEdit} onChange={loadStatus} onError={setError} />

            <h2>{t('3. Submit for verification')}</h2>
            {status.validation && (
              <div className={`onboarding-check ${status.validation.result === 'PASS' ? 'ok' : 'bad'}`}>
                <strong>{status.validation.result === 'PASS' ? t('Automatic checks passed') : t('Please fix the following')}</strong>
                {status.validation.issues.map((issue) => <span key={issue}>• {issue}</span>)}
              </div>
            )}
            {canEdit ? (
              <button type="button" className="primary-action" onClick={submit} disabled={busy === 'submit'}>
                {busy === 'submit' ? t('Submitting…') : status.submitted_at ? t('Re-submit') : t('Submit for verification')}
              </button>
            ) : (
              <p className="onboarding-next">
                {status.verification_status === 'VERIFIED' && t('Your organisation is verified. Check your email for your sign-in link.')}
                {status.verification_status === 'REJECTED' && t('Your application was not approved. Our team will contact you.')}
                {status.verification_status === 'PENDING' && t('Your application is with our Compliance Office for screening and approval. We will email you.')}
              </p>
            )}
          </div>
        )}

        <p className="onboarding-footer"><Link to="/login">{t('Already verified? Sign in')}</Link></p>
      </div>
      <AssistantWidget />
    </main>
  )
}

export default Onboarding

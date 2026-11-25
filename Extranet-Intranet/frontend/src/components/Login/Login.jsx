import { useT } from '../../i18n'
import LanguageSwitch from '../../i18n/LanguageSwitch'
import ThemeSwitch from '../../theme/ThemeSwitch'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import { saveSession, PORTAL_ROLES } from '../../api/auth'
import './Login.css'
import { translateServer } from '../../i18n/serverMessages'

// Demo one-click sign-in: only in development or when VITE_DEMO_LOGIN=true (removed from normal production builds).
const DemoLogins = import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGIN === 'true' ? lazy(() => import('./DemoLogins')) : null

const REGIONS = [
  { label: 'Spain', icon: '📍' },
  { label: 'Europe', icon: '🇪🇺' },
  { label: 'India', icon: '🇮🇳' },
  { label: 'Global', icon: '🌐' },
]

function WorldNetwork() {
  const nodes = [
    [92, 88, 0], [145, 140, 0.7], [318, 80, 1.4],
    [342, 145, 0.3], [452, 85, 1.1], [485, 160, 1.8],
  ]

  return (
    <svg viewBox="0 0 560 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.22)" strokeWidth="1">
        <path d="M55 68 L120 55 L153 78 L141 112 L98 122 L66 100 Z" />
        <path d="M148 132 L182 142 L172 190 L145 202 L134 166 Z" />
        <path d="M296 66 L340 62 L352 92 L318 102 L296 88 Z" />
        <path d="M310 112 L360 106 L370 150 L340 182 L314 150 Z" />
        <path d="M362 58 L470 52 L502 88 L452 120 L382 108 Z" />
        <path d="M458 150 L502 146 L512 172 L470 178 Z" />
      </g>
      <g stroke="#6fc0ff" strokeWidth="1.4" fill="none" opacity="0.85">
        <path d="M92 88 Q230 8 318 80" />
        <path d="M145 140 Q230 60 342 145" />
        <path d="M318 80 Q390 20 452 85" />
        <path d="M342 145 Q420 110 485 160" />
        <path d="M92 88 Q240 180 485 160" />
      </g>
      {nodes.map(([x, y, delay], index) => (
        <g key={index}>
          <circle cx={x} cy={y} r="8" fill="#3ea2ff" opacity="0.18" />
          <circle cx={x} cy={y} r="3.5" fill="#9fd6ff" className="login-node"
            style={{ animationDelay: `${delay}s` }} />
        </g>
      ))}
    </svg>
  )
}

function Building() {
  return (
    <svg viewBox="0 0 420 520" aria-hidden="true">
      <path d="M20 520 L20 130 L300 70 L300 520 Z" fill="#0a2350" stroke="#79b8ff" strokeWidth="1.5" />
      <g stroke="#79b8ff" strokeWidth="1" opacity="0.65">
        {[0, 1, 2, 3, 4, 5].map((c) => (
          <line key={`v${c}`} x1={20 + c * 47} y1={130 - c * 10} x2={20 + c * 47} y2="520" />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((r) => (
          <line key={`h${r}`} x1="20" y1={160 + r * 45} x2="300" y2={110 + r * 45} />
        ))}
      </g>
    </svg>
  )
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function EyeIcon({ hidden }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18.4 18.4 0 0 1-2.16 3.19" />
      <path d="M6.6 6.6A18.4 18.4 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="m2 2 20 20" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function SignInIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    </svg>
  )
}

function SupportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2v2Z" />
      <path d="M3 16a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2v2Z" />
      <path d="M18 18a4 4 0 0 1-4 3h-3" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function destinationFor(role, requested) {
  if (requested === 'intranet' || requested === 'extranet') return `/${requested}`
  if (PORTAL_ROLES.extranet.includes(String(role))) return '/extranet'
  return '/intranet'
}

const SSO_ERRORS = {
  denied: 'Sign-in was cancelled.',
  not_allowed: 'This account cannot use single sign-on. Use your email and password.',
  failed: 'Single sign-on could not be completed. Please try again.',
  unavailable: 'Single sign-on is not available right now.',
}

function Login() {
  const t = useT()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedWorkspace = searchParams.get('workspace')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mfaToken, setMfaToken] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaMethods, setMfaMethods] = useState({ totp: true, webauthn: false })
  const [ssoProvider, setSsoProvider] = useState('')
  const ssoHandled = useRef(false)

  const finishLogin = (payload, keepSignedIn) => {
    if (payload.mfa_required) {
      setMfaToken(payload.mfa_token)
      setMfaMethods(payload.mfa_methods || { totp: true, webauthn: false })
      return
    }

    if (payload.token) {
      saveSession(payload.token, payload.user, keepSignedIn)
      api.post('/auth/nav-session').catch(() => {})
    }

    // Privileged roles must enable MFA before using the workspace (Technical Spec §3.1).
    if (payload.mfa_setup_required) {
      navigate('/intranet/security?required=1', { replace: true })
      return
    }

    navigate(destinationFor(payload.user?.role, requestedWorkspace), { replace: true })
  }

  useEffect(() => {
    api.get('/auth/oidc/status')
      .then((response) => setSsoProvider(response.data?.data?.enabled ? response.data.data.provider : ''))
      .catch(() => {})
    if (ssoHandled.current) return
    ssoHandled.current = true
    const failure = searchParams.get('sso_error')
    if (failure) {
      setError(t(SSO_ERRORS[failure] || SSO_ERRORS.failed))
      window.history.replaceState(null, '', '/login')
    } else if (searchParams.get('sso') === '1') {
      window.history.replaceState(null, '', '/login')
      setLoading(true)
      api.post('/auth/oidc/complete')
        .then((response) => finishLogin(response.data?.data || {}, false))
        .catch(() => setError(t(SSO_ERRORS.failed)))
        .finally(() => setLoading(false))
    }
    // Runs once when the login page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = async (emailValue, passwordValue) => {
    setLoading(true)
    setError('')

    try {
      const response = await api.post('/auth/login', { email: emailValue, password: passwordValue })
      finishLogin(response.data?.data || response.data || {}, remember)
    } catch (err) {
      setError(
        t(err.response?.data?.message || '') ||
        (err.code === 'ERR_NETWORK'
          ? t('The backend is not reachable. Start the Express server on port 5000.')
          : t('We could not verify those credentials. Please try again.'))
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    signIn(email, password)
  }

  const pickDemo = useCallback((demoEmail, demoPassword) => {
    setEmail(demoEmail)
    setPassword(demoPassword)
    signIn(demoEmail, demoPassword)
    // signIn only uses state setters and the remember flag, so a stable callback is safe here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verifyMfa = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await api.post('/auth/mfa/verify', { mfa_token: mfaToken, code: mfaCode })
      const payload = response.data?.data || {}
      saveSession(payload.token, payload.user, remember)
      api.post('/auth/nav-session').catch(() => {})
      navigate(destinationFor(payload.user?.role, requestedWorkspace), { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid authentication code.')
    } finally {
      setLoading(false)
    }
  }

  const useSecurityKey = async () => {
    setLoading(true)
    setError('')
    try {
      const options = await api.post('/auth/mfa/webauthn/login/options', { mfa_token: mfaToken })
      const assertion = await startAuthentication({ optionsJSON: options.data.data })
      const response = await api.post('/auth/mfa/webauthn/login/verify', { mfa_token: mfaToken, response: assertion })
      const payload = response.data?.data || {}
      saveSession(payload.token, payload.user, remember)
      api.post('/auth/nav-session').catch(() => {})
      navigate(destinationFor(payload.user?.role, requestedWorkspace), { replace: true })
    } catch (err) {
      setError(t(err.response?.data?.message || 'The security key was not used or could not be verified.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <ThemeSwitch className="theme-switch--login" />
      <LanguageSwitch className="language-switch--login" />
      {/* Brand panel */}
      <section className="login-brand">
        <div className="login-brand-wash" />
        <div className="login-building"><Building /></div>

        <div className="login-brand-inner">
          <div className="login-logo-row">
            <div className="login-logo">
              <span>G</span>
              <i />
            </div>
            <div className="login-logo-text">
              <strong>GLOBAL GROUP</strong>
              <div className="login-logo-sub">
                <span /> SPAIN <span />
              </div>
            </div>
          </div>

          <div className="login-brand-copy">
            <h1>
              {t('One Platform.')}
              <br />
              <span>{t('Connected Globally.')}</span>
            </h1>
            <p>
              {t('A unified digital workspace connecting our people, partners and business operations across regions.')}
            </p>
            <div className="login-regions">
              {REGIONS.map((region, index) => (
                <span key={region.label}>
                  {index > 0 && <b>|</b>}
                  <em>{region.icon}</em> {t(region.label)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="login-world"><WorldNetwork /></div>

        <div className="login-brand-footer">
          <span /> {t('Collaborate')} <b>•</b> {t('Innovate')} <b>•</b> {t('Grow')} <span />
        </div>
      </section>

      {/* Sign-in panel */}
      <section className="login-form-side">
        <div className="login-card">
          <h2>{t('Welcome to Global Group')}</h2>
          <p className="login-subtitle">{t('Sign in to access your workspace.')}</p>

          {error && <div className="login-error">{translateServer(error)}</div>}

          {mfaToken ? (
            <form onSubmit={verifyMfa} className="login-form">
              {mfaMethods.webauthn && (
                <button type="button" className="login-submit" disabled={loading} onClick={useSecurityKey}>
                  <ShieldIcon /> {loading ? t('Verifying…') : t('Use security key')}
                </button>
              )}
              {mfaMethods.totp && (
                <>
                  <div className="login-field">
                    <label htmlFor="login-code"><LockIcon /> {t('Authentication code')}</label>
                    <input
                      id="login-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      maxLength={6}
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value)}
                      placeholder={t('6-digit code from your authenticator')}
                    />
                  </div>
                  <button type="submit" className="login-submit" disabled={loading}>
                    <SignInIcon /> {loading ? t('Verifying…') : t('Verify code')}
                  </button>
                </>
              )}
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="login-email">
                <MailIcon /> {t('Email Address')}
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('Enter your email address')}
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">
                <LockIcon /> {t('Password')}
              </label>
              <div className="login-password-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('Enter your password')}
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t('Hide password') : t('Show password')}
                >
                  <EyeIcon hidden={showPassword} />
                </button>
              </div>
            </div>

            <div className="login-options">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                {t('Remember Me')}
              </label>
              <Link to="/reset-password" className="login-forgot">{t('Forgot Password?')}</Link>
            </div>

            <button type="submit" className="login-submit" disabled={loading}>
              <SignInIcon />
              {loading ? t('Signing in…') : t('Sign In')}
            </button>
            {ssoProvider && (
              <a className="login-sso" href={`${api.defaults.baseURL}/auth/oidc/start`}>
                {t('Continue with {provider}', { provider: ssoProvider })}
              </a>
            )}
          </form>
          )}

          {DemoLogins && !mfaToken && (
            <Suspense fallback={null}>
              <DemoLogins onPick={pickDemo} disabled={loading} requested={searchParams.get('as')} />
            </Suspense>
          )}

          <div className="login-help-divider">
            <span /> {t('Need help?')} <span />
          </div>
          <a className="login-support" href="mailto:support@grupoglobal.es">
            <SupportIcon /> {t('Contact Support')}
          </a>

          <div className="login-secure">
            <ShieldIcon />
            {t('Secure Access')} <b>|</b> Global Group
          </div>
        </div>
      </section>
    </main>
  )
}

export default Login

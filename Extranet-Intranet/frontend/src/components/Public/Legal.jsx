import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/client'
import LanguageSwitch from '../../i18n/LanguageSwitch'
import { useT } from '../../i18n'
import '../Portals/Shared/privacy/Privacy.css'
import AssistantWidget from '../Portals/Shared/assistant/AssistantWidget'

const TITLES = { privacy: 'Privacy policy', terms: 'Terms of use', cookies: 'Cookie policy' }

// Plain summaries of what the platform really does. Grupo Global's approved legal text replaces them
// as soon as its address is set (PRIVACY_POLICY_URL, TERMS_URL, COOKIE_POLICY_URL).
const SECTIONS = {
  privacy: [
    ['Who is responsible', 'Grupo Global is responsible for the personal data processed on this platform. Write to {contact} for any privacy question.'],
    ['What we process', 'Your name, work email, role, organisation and region; what you create or upload (files, messages, records); sign-in and security records; and, for registering companies, legal and identity documents for verification.'],
    ['Why', 'To give you access to the workspace, run the services you use, verify member companies as anti-money-laundering rules require, keep the platform secure and meet legal duties such as working-time records and invoicing.'],
    ['Who receives it', 'Only service providers working for Grupo Global under contract, such as hosting, email, payments and identity screening. Data stays in the European Union unless you are told otherwise.'],
    ['How long', 'While your account is active, and afterwards only as long as the law requires (for example invoices, working-time records and anti-money-laundering files). Then it is deleted.'],
    ['Your rights', 'You can access, correct, delete, restrict or download your data, object to its use and withdraw your consent, from Privacy (GDPR) in your profile menu or by writing to {contact}. You may also complain to the Spanish Data Protection Agency (AEPD).'],
    ['Security', 'Connections are encrypted, files and confidential fields are stored encrypted, every sensitive action is recorded in a tamper-evident audit log, and administrators must use two-step sign-in.'],
  ],
  terms: [
    ['Who may use the platform', 'Grupo Global staff and the verified organisations it works with. Each account is personal: do not share your password or sign-in codes.'],
    ['Acceptable use', 'Use the platform only for legitimate business with Grupo Global. Do not upload unlawful content, try to reach information you are not entitled to, or disturb the service.'],
    ['Confidentiality', 'Information shared on the platform is confidential. Verified organisations also accept a confidentiality agreement (NDA) and the Code of Ethics.'],
    ['Membership and payments', 'Paid memberships and invoices follow the plan and price shown when you subscribe. Payments are processed by Stripe or PayPal; the platform never stores card details.'],
    ['Suspension', 'Grupo Global may suspend access that breaks these terms, the Code of Ethics or the law, and keeps a record of the decision.'],
  ],
}

function Legal() {
  const t = useT()
  const { doc } = useParams()
  const kind = TITLES[doc] ? doc : 'privacy'
  const [info, setInfo] = useState(null)

  useEffect(() => {
    api.get('/public/legal').then((response) => setInfo(response.data.data)).catch(() => setInfo(null))
  }, [])

  const external = info?.documents?.[kind]?.startsWith('http') ? info.documents[kind] : null
  const contact = info?.contact || 'support@grupoglobal.es'

  return (
    <main className="legal-page">
      <header className="legal-head">
        <Link to="/" className="legal-brand">Global Group</Link>
        <LanguageSwitch />
      </header>
      <nav className="legal-tabs" aria-label={t('Legal documents')}>
        {Object.entries(TITLES).map(([key, title]) => (
          <Link key={key} to={`/legal/${key}`} aria-current={key === kind ? 'page' : undefined}>{t(title)}</Link>
        ))}
      </nav>
      <article className="legal-body">
        <h1>{t(TITLES[kind])}</h1>
        {info?.version && <p className="legal-version">{t('Version {version}', { version: info.version })}</p>}
        {external && (
          <p className="legal-external">
            <a href={external} target="_blank" rel="noopener noreferrer">{t('Read the full text published by Grupo Global')}</a>
          </p>
        )}
        {kind === 'cookies' ? (
          <>
            <p>{t('The platform sets only what it needs to work. There are no analytics, advertising or tracking cookies, so there is nothing optional to accept or refuse.')}</p>
            <table className="legal-table">
              <thead><tr><th>{t('Cookie or storage')}</th><th>{t('Purpose')}</th><th>{t('Type')}</th></tr></thead>
              <tbody>
                {(info?.cookies || []).map((cookie) => (
                  <tr key={cookie.name}><td>{t(cookie.name)}</td><td>{t(cookie.purpose)}</td><td>{t('Essential')}</td></tr>
                ))}
              </tbody>
            </table>
            <p>{t('You can delete them from your browser settings at any time; you will then be signed out.')}</p>
          </>
        ) : (
          SECTIONS[kind].map(([heading, text]) => (
            <section key={heading}>
              <h2>{t(heading)}</h2>
              <p>{t(text, { contact })}</p>
            </section>
          ))
        )}
        {!external && <p className="legal-draft">{t('This is a plain-language summary of how the platform works. Grupo Global’s approved legal text will be published here.')}</p>}
      </article>
      <AssistantWidget />
    </main>
  )
}

export default Legal

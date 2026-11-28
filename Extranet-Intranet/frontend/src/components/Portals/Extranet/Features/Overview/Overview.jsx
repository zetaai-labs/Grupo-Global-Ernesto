import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import { useT, dateLocale } from '../../../../../i18n'
import '../../../Intranet/Features/Overview/PresidentialHome.css'

const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(value || 0))
const shortDate = (value) => (value ? new Date(value).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const settle = (request, pick, fallback) => request.then((response) => pick(response.data?.data)).catch(() => fallback)

const TITLES = { investor: 'Investor Confidential Vault', supplier: 'Supplier Hub', client: 'Client & Partner Hub', partner: 'Client & Partner Hub' }

/**
 * Client & Partner Hub (Schema Document §3): shared project milestones, shared documents,
 * invoice history and the team chat. Investors see their vault and deal rooms first.
 */
function Overview() {
  const t = useT()
  const user = getUser()
  const role = user?.role
  const sells = ['client', 'partner'].includes(role)
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      settle(api.get('/external-shares/shared-with-me'), (d) => (d?.files?.length || 0) + (d?.folders?.length || 0), null),
      settle(api.get('/content/my-submissions'), (d) => (Array.isArray(d) ? d.length : 0), null),
      settle(api.get('/projects/shared'), (d) => (Array.isArray(d) ? d : []), []),
      settle(api.get('/billing/my'), (d) => d || null, null),
      sells ? settle(api.get('/zylax/portal/quotes'), (d) => (Array.isArray(d) ? d : []), []) : Promise.resolve([]),
      role === 'investor' ? settle(api.get('/vault/rooms'), (d) => (Array.isArray(d) ? d : []), []) : Promise.resolve([]),
      settle(api.get('/organizations/me'), (d) => d || null, null),
    ]).then(([documents, submissions, projects, billing, quotes, rooms, org]) => {
      if (alive) setData({ documents, submissions, projects, billing, quotes, rooms, org })
    })
    return () => { alive = false }
  }, [role, sells])

  const invoices = data?.billing?.invoices || []
  const toPay = invoices.filter((invoice) => invoice.payable)
  const toPayTotal = toPay.reduce((sum, invoice) => sum + Number(invoice.total_eur || 0), 0)
  const membership = (data?.billing?.subscriptions || []).find((sub) => sub.category === 'MEMBERSHIP') || data?.billing?.subscriptions?.[0]
  const quotesToAnswer = (data?.quotes || []).filter((quote) => quote.status === 'SENT')
  const milestones = (data?.projects || [])
    .flatMap((project) => (project.milestones || []).map((milestone) => ({ ...milestone, project: project.title })))
    .filter((milestone) => milestone.status !== 'DONE')
    .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
    .slice(0, 5)
  const ndaPending = data?.org?.nda && !data.org.nda.accepted_at

  const attention = data ? [
    ndaPending && { key: 'nda', count: '!', label: 'Accept the confidentiality agreement (NDA) to unlock shared documents', action: 'Read and accept', link: '/extranet/overview', alert: true },
    toPay.length && { key: 'pay', count: toPay.length, label: 'Invoices to pay: {total}', values: { total: euro(toPayTotal) }, action: 'Pay now', link: '/extranet/billing', alert: true },
    quotesToAnswer.length && { key: 'quotes', count: quotesToAnswer.length, label: 'Quotes waiting for your answer', action: 'Review now', link: '/extranet/orders' },
  ].filter(Boolean) : []

  const cards = [
    role === 'investor' && { label: 'Deal rooms', value: data?.rooms?.length ?? '…', note: 'Opened to you', link: '/extranet/investor-vault' },
    { label: 'Shared documents', value: data?.documents ?? '…', note: 'Available to you', link: '/extranet/shared-documents' },
    { label: 'Active projects', value: data ? data.projects.filter((project) => project.phase !== 'COMPLETED').length : '…', note: 'Shared with your company', link: '/extranet/project-updates' },
    data?.billing && role !== 'investor' && { label: 'Membership', value: membership ? t(membership.status === 'ACTIVE' ? 'Active' : membership.status) : t('None'), note: membership?.current_period_end ? t('Until {date}', { date: shortDate(membership.current_period_end) }) : membership?.plan_name || 'No plan yet', link: '/extranet/billing' },
    { label: 'My submissions', value: data?.submissions ?? '…', note: 'Files you sent to us', link: '/extranet/my-submissions' },
  ].filter(Boolean)

  return (
    <section className="feature-page presidential">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t(TITLES[role] || 'Client & Partner Hub')}</div>
          <h1>{t('Welcome, {name}', { name: (user?.name || '').split(' ')[0] })}</h1>
          <p>{data?.org?.legal_name || t('Your secure workspace with Global Group.')}</p>
        </div>
        {role === 'investor'
          ? <Link className="primary-action" to="/extranet/investor-vault">{t('Open my vault')}</Link>
          : <Link className="primary-action" to="/extranet/shared-documents">{t('Browse documents')}</Link>}
      </div>

      <div className="ph-layout">
        <div className="feature-panel ph-attention">
          <div className="panel-heading"><div><h3>{t('Needs your attention')}</h3></div></div>
          {!data && <p className="ph-muted">{t('Loading…')}</p>}
          {data && !attention.length && <p className="ph-clear">✓ {t('All clear. Nothing is waiting for you.')}</p>}
          <ul>
            {attention.map((item) => (
              <li key={item.key} className={item.alert ? 'is-alert' : ''}>
                <strong>{item.count}</strong>
                <span>{t(item.label, item.values)}</span>
                <Link to={item.link} className="secondary-action">{t(item.action)}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="feature-panel ph-actions">
          <div className="panel-heading"><div><h3>{t('Quick actions')}</h3></div></div>
          <div className="ph-action-grid">
            <Link to="/extranet/my-submissions"><span aria-hidden="true">⇧</span>{t('Send us a document')}</Link>
            <Link to="/extranet/chat"><span aria-hidden="true">💬</span>{t('Message the Global Group team')}</Link>
            <Link to="/extranet/video-conferencing"><span aria-hidden="true">📹</span>{t('Start a video meeting')}</Link>
            {sells && <Link to="/extranet/orders"><span aria-hidden="true">▣</span>{t('Quotes & Orders')}</Link>}
          </div>
        </div>
      </div>

      <div className="ph-cards">
        {cards.map((card) => (
          <Link key={card.label} to={card.link} className="stat-card ph-card">
            <span>{t(card.label)}</span>
            <strong>{card.value}</strong>
            <small>{t(card.note)}</small>
          </Link>
        ))}
      </div>

      <div className="ph-layout">
        <div className="feature-panel">
          <div className="panel-heading">
            <div><h3>{t('Upcoming project milestones')}</h3></div>
            <Link to="/extranet/project-updates" className="ph-link">{t('All projects')} →</Link>
          </div>
          {data && !milestones.length && <p className="ph-muted">{t('No upcoming milestones shared with you.')}</p>}
          <ul className="ph-recent">
            {milestones.map((milestone) => (
              <li key={milestone.milestone_id}>
                <span>{milestone.title}</span>
                <em>{milestone.project}</em>
                <time>{shortDate(milestone.due_date)}</time>
              </li>
            ))}
          </ul>
        </div>

        {data?.billing && (
          <div className="feature-panel">
            <div className="panel-heading">
              <div><h3>{t('Invoice history')}</h3></div>
              <Link to="/extranet/billing" className="ph-link">{t('Billing')} →</Link>
            </div>
            {!invoices.length && <p className="ph-muted">{t('No invoices yet.')}</p>}
            <ul className="ph-recent">
              {invoices.slice(0, 5).map((invoice) => (
                <li key={invoice.invoice_id}>
                  <span>{invoice.invoice_number || '—'}</span>
                  <em>{invoice.paid_at ? t('Invoice paid') : invoice.payable ? t('Payment pending') : t(invoice.status)}</em>
                  <time>{euro(invoice.total_eur)}</time>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

export default Overview

import { useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import { downloadFromApi } from '../../../../../utils/download'
import { euro } from '../Commercial/format'
import './MembershipRevenue.css'

const tone = { ACTIVE: 'zx-accepted', PAST_DUE: 'zx-expired', CANCELED: 'zx-rejected' }

/** Paid members and each partner's share of the membership revenue (net of VAT), with the settlement CSV. */
function MembershipRevenue() {
  const t = useT()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/billing/memberships')
      .then((response) => setReport(response.data.data))
      .catch((err) => setError(translateServer(err.response?.data?.message) || t('Could not load this page.')))
  }, [t])

  if (error) return <div className="cloud-notice zx-notice" role="alert"><span>{error}</span></div>
  if (!report) return <div className="page-loading" role="status" aria-live="polite" />

  const byParty = Object.fromEntries(report.totals.map((row) => [row.party, row]))

  return (
    <div className="mr">
      <div className="mr-split">
        {report.split.map((part) => (
          <div key={part.party} className="stat-card">
            <div className="stat-top"><span>{part.party}</span><span className="stat-icon">{part.pct}%</span></div>
            <strong>{euro(byParty[part.party]?.this_year_eur || 0)}</strong>
            <small>{t('This year · {total} in total', { total: euro(byParty[part.party]?.total_eur || 0) })}</small>
          </div>
        ))}
        <div className="stat-card">
          <div className="stat-top"><span>{t('Membership revenue')}</span><span className="stat-icon">€</span></div>
          <strong>{euro(report.net_revenue_eur)}</strong>
          <small>{t('{count} active members · without VAT', { count: report.active_members })}</small>
        </div>
      </div>

      <div className="mr-actions">
        <p>{t('Each paid membership invoice is split between the partners when it is paid; refunds are reversed the same way.')}</p>
        <button type="button" onClick={() => downloadFromApi('/billing/memberships/shares.csv', 'membership-revenue-shares.csv').catch(() => setError(t('The download could not be prepared.')))}>
          ⇩ {t('Download the split (CSV)')}
        </button>
      </div>

      <div className="zx-table-wrap zx-card">
        <table>
          <thead><tr><th>{t('Member')}</th><th>{t('Plan')}</th><th>{t('Period')}</th><th>{t('Payment')}</th><th>{t('Status')}</th></tr></thead>
          <tbody>
            {report.members.map((row) => (
              <tr key={row.subscription_id}>
                <td>{row.legal_name}<small className="mr-muted"> · {row.country}</small></td>
                <td>{t(row.plan_name)}</td>
                <td>{row.period_start} → {row.period_end}{row.cancel_at_period_end ? ` · ${t('ends then')}` : ''}</td>
                <td>{row.unpaid_invoice ? <span className="zx-pill zx-expired">{t('Payment pending')} · {row.unpaid_invoice}</span> : <span className="zx-pill zx-accepted">{t('Invoice paid')}</span>}</td>
                <td><span className={`zx-pill ${tone[row.status] || ''}`}>{t(row.status)}</span></td>
              </tr>
            ))}
            {!report.members.length && <tr><td colSpan="5" className="zx-empty">{t('No paid members yet. Members appear here once Compliance approves them.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default MembershipRevenue

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../../../api/client'
import { useT } from '../../../i18n'
import { euro } from './Zylax/zylaxFormat'
import './MembershipBanner.css'

/** Reminds a new member that the membership invoice is waiting, until it is paid. */
function MembershipBanner() {
  const t = useT()
  const location = useLocation()
  const [invoice, setInvoice] = useState(null)

  useEffect(() => {
    let alive = true
    api.get('/billing/my')
      .then((response) => {
        const data = response.data?.data
        const member = (data?.subscriptions || []).some((sub) => sub.category === 'MEMBERSHIP' && sub.status !== 'CANCELED')
        const due = member ? (data.invoices || []).find((row) => row.payable) : null
        if (alive) setInvoice(due || null)
      })
      .catch(() => { if (alive) setInvoice(null) })
    return () => { alive = false }
  }, [location.pathname])

  if (!invoice || location.pathname.endsWith('/billing')) return null

  return (
    <section className="membership-banner" role="region" aria-label={t('Membership')}>
      <div>
        <strong>{t('Your membership invoice is ready')}</strong>
        <p>{t('Invoice {number} · {amount}. Pay it by card or PayPal to complete your membership.', { number: invoice.invoice_number, amount: euro(invoice.total_eur) })}</p>
      </div>
      <Link to="/extranet/billing" className="primary-action">{t('Pay now')}</Link>
    </section>
  )
}

export default MembershipBanner

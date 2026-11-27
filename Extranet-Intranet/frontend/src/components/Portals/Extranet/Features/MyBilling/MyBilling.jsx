import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../../../../api/client'
import { getLanguage, useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import { downloadFromApi } from '../../../../../utils/download'
import { euro } from '../../../Intranet/Features/Commercial/format'
import '../../../Intranet/Features/Commercial/Commercial.css'

const tone = { ACTIVE: 'zx-accepted', PAID: 'zx-accepted', PAST_DUE: 'zx-expired', ISSUED: 'zx-sent', CANCELED: 'zx-rejected', REFUNDED: 'zx-rejected' }
const SAFE_CHECKOUT = /^https:\/\/([a-z0-9-]+\.)*(stripe\.com|paypal\.com)\//i

function MyBilling() {
  const t = useT()
  const [params] = useSearchParams()
  const [data, setData] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const handled = useRef(false)

  const load = useCallback(async () => {
    try {
      setData((await api.get('/billing/my')).data.data)
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message || 'Could not load this page.'))
    }
  }, [])

  useEffect(() => {
    load()
    if (handled.current) return
    handled.current = true
    const result = params.get('payment')
    const order = params.get('token')
    if (result) window.history.replaceState(null, '', '/extranet/billing')
    if (result === 'stripe') setNotice(t('Thank you. Your card payment is being confirmed and will appear here shortly.'))
    if (result === 'cancelled') setNotice(t('Payment cancelled. Nothing was charged.'))
    if (result === 'paypal' && order) {
      setBusy(true)
      api.post('/billing/paypal/capture', { order_id: order })
        .then(() => { setNotice(t('Payment received. Thank you.')); return load() })
        .catch((error) => setNotice(translateServer(error.response?.data?.message) || t('The action could not be completed.')))
        .finally(() => setBusy(false))
    }
    // Runs once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pay = async (invoice, provider) => {
    setBusy(true)
    try {
      const response = await api.post(`/billing/invoices/${invoice.invoice_id}/checkout`, { provider })
      const url = response.data?.data?.url
      if (!SAFE_CHECKOUT.test(url || '')) throw new Error('unexpected')
      window.location.assign(url)
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message) || t('The action could not be completed.'))
      setBusy(false)
    }
  }

  const providers = data?.providers || {}
  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('COMMERCIAL')}</div>
          <h1>{t('Billing')}</h1>
          <p>{t('Your subscriptions and invoices. Pay online by card or PayPal where available.')}</p>
        </div>
      </div>
      {notice && <div className="cloud-notice zx-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label={t('Dismiss')}>✕</button></div>}

      <h3 className="zx-heading">{t('Subscriptions')}</h3>
      <div className="zx-table-wrap zx-card">
        <table>
          <thead><tr><th>{t('Plan')}</th><th>{t('Price')}</th><th>{t('Current period')}</th><th>{t('Status')}</th></tr></thead>
          <tbody>
            {(data?.subscriptions || []).map((row) => (
              <tr key={row.subscription_id}>
                <td>{t(row.plan_name)}{row.category === 'MEMBERSHIP' ? ` · ${t('Membership')}` : ''}</td><td>{euro(row.amount_eur)} / {t(({ MONTH: 'month', YEAR: 'year', YEARS_2: '2 years', YEARS_3: '3 years' })[row.billing_interval] || 'month')} + {t('VAT')}</td>
                <td>{row.current_period_start} → {row.current_period_end}{row.cancel_at_period_end ? ` · ${t('ends then')}` : ''}</td>
                <td><span className={`zx-pill ${tone[row.status] || ''}`}>{t(row.status)}</span></td>
              </tr>
            ))}
            {data && !data.subscriptions.length && <tr><td colSpan="4" className="zx-empty">{t('Nothing here yet.')}</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="zx-heading">{t('Invoices')}</h3>
      <div className="zx-table-wrap zx-card">
        <table>
          <thead><tr><th>{t('Invoice')}</th><th>{t('Due date')}</th><th>{t('Total')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>
            {(data?.invoices || []).map((row) => (
              <tr key={row.invoice_id}>
                <td className="zx-mono">{row.invoice_number}</td><td>{row.due_date || '—'}</td><td>{euro(row.total_eur)}</td>
                <td><span className={`zx-pill ${tone[row.status] || ''}`}>{t(row.status)}</span></td>
                <td className="zx-form-actions">
                  <button type="button" className="zx-link" onClick={() => downloadFromApi(`/zylax/hub/pos/my-invoices/${row.invoice_id}/pdf?lang=${getLanguage()}`, `${row.invoice_number}.pdf`).catch(() => setNotice(t('Could not create the PDF.')))}>PDF</button>
                  {row.payable && providers.stripe && <button type="button" className="primary-action" disabled={busy} onClick={() => pay(row, 'stripe')}>{t('Pay by card')}</button>}
                  {row.payable && providers.paypal && <button type="button" disabled={busy} onClick={() => pay(row, 'paypal')}>{t('Pay with PayPal')}</button>}
                </td>
              </tr>
            ))}
            {data && !data.invoices.length && <tr><td colSpan="5" className="zx-empty">{t('Nothing here yet.')}</td></tr>}
          </tbody>
        </table>
      </div>
      {data && !providers.stripe && !providers.paypal && <p className="zx-empty">{t('Online payment is not available yet. Please pay by bank transfer using the invoice details.')}</p>}
    </section>
  )
}

export default MyBilling

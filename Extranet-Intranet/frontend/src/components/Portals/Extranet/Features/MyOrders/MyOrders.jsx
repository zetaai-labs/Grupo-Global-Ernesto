import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { useT } from '../../../../../i18n'
import { euro } from '../../../Intranet/Features/Commercial/format'
import StatusPill from '../../../Intranet/Features/Commercial/StatusPill'
import '../../../Intranet/Features/Commercial/Commercial.css'

function MyOrders() {
  const t = useT()
  const [quotes, setQuotes] = useState([])
  const [orders, setOrders] = useState([])
  const [detail, setDetail] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [quoteList, orderList] = await Promise.all([api.get('/zylax/portal/quotes'), api.get('/zylax/portal/orders')])
      setQuotes(quoteList.data?.data || [])
      setOrders(orderList.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load your orders.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const open = async (kind, id) => {
    try {
      const response = await api.get(`/zylax/portal/${kind}/${id}`)
      setDetail({ kind, ...response.data.data })
    } catch (error) {
      setNotice(error.response?.data?.message || t('Could not open this record.'))
    }
  }

  const decide = async (action) => {
    if (action === 'accept' && !window.confirm(t('Accept this quote and place the order?'))) return
    setBusy(true)
    try {
      await api.post(`/zylax/portal/quotes/${detail.quote_id}/${action}`)
      setNotice(t(action === 'accept' ? 'Order placed.' : 'Quote declined.'))
      setDetail(null)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || t('The action could not be completed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('COMMERCIAL')}</div>
          <h1>{t('Quotes & Orders')}</h1>
          <p>{t('Review the offers sent to your company and follow your orders until delivery.')}</p>
        </div>
      </div>

      {notice && (
        <div className="cloud-notice zx-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label={t('Dismiss')}>✕</button>
        </div>
      )}

      {detail && (
        <article className="zx-detail">
          <header>
            <div>
              <h3>{detail.kind === 'quotes' ? detail.quote_number : detail.order_number} <StatusPill status={detail.status} /></h3>
              {detail.valid_until && <p>{t('Valid until')} {detail.valid_until}</p>}
            </div>
            <button type="button" onClick={() => setDetail(null)} aria-label={t('Close')}>✕</button>
          </header>
          <div className="zx-table-wrap">
            <table>
              <thead><tr><th>{t('Product')}</th><th>{t('Qty')}</th><th>{t('Price')}</th><th>{t('Disc. %')}</th><th>{t('Net')}</th><th>{t('VAT')}</th></tr></thead>
              <tbody>
                {detail.lines.map((line) => <tr key={line.line_id}><td>{line.name}</td><td>{line.qty}</td><td>{euro(line.unit_price_eur)}</td><td>{Number(line.discount_pct)}</td><td>{euro(line.net_eur)}</td><td>{euro(line.tax_eur)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="zx-totals"><span>{t('Net')} {euro(detail.net_eur)}</span><span>{t('VAT')} {euro(detail.tax_eur)}</span><strong>{t('Total')} {euro(detail.total_eur)}</strong></div>
          {detail.notes && <p className="zx-note">{detail.notes}</p>}
          {detail.events && (
            <ol className="zx-timeline">
              {detail.events.map((event) => <li key={event.event_id}><StatusPill status={event.status} /> <span>{new Date(event.created_at).toLocaleString()}</span></li>)}
            </ol>
          )}
          {detail.kind === 'quotes' && detail.status === 'SENT' && (
            <div className="zx-form-actions">
              <button type="button" className="primary-action" disabled={busy} onClick={() => decide('accept')}>{t('Accept quote')}</button>
              <button type="button" disabled={busy} onClick={() => decide('reject')}>{t('Decline')}</button>
            </div>
          )}
        </article>
      )}

      <h3 className="zx-heading">{t('Quotes')}</h3>
      <div className="zx-table-wrap zx-card">
        <table>
          <thead><tr><th>{t('Quote')}</th><th>{t('Valid until')}</th><th>{t('Total')}</th><th>{t('Status')}</th></tr></thead>
          <tbody>
            {quotes.map((row) => <tr key={row.quote_id} className="zx-click" onClick={() => open('quotes', row.quote_id)}><td className="zx-mono">{row.quote_number}</td><td>{row.valid_until}</td><td>{euro(row.total_eur)}</td><td><StatusPill status={row.status} /></td></tr>)}
            {!quotes.length && <tr><td colSpan="4" className="zx-empty">{t('Nothing here yet.')}</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="zx-heading">{t('Orders')}</h3>
      <div className="zx-table-wrap zx-card">
        <table>
          <thead><tr><th>{t('Order')}</th><th>{t('Quote')}</th><th>{t('Total')}</th><th>{t('Status')}</th></tr></thead>
          <tbody>
            {orders.map((row) => <tr key={row.order_id} className="zx-click" onClick={() => open('orders', row.order_id)}><td className="zx-mono">{row.order_number}</td><td className="zx-mono">{row.quote_number}</td><td>{euro(row.total_eur)}</td><td><StatusPill status={row.status} /></td></tr>)}
            {!orders.length && <tr><td colSpan="4" className="zx-empty">{t('Nothing here yet.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default MyOrders

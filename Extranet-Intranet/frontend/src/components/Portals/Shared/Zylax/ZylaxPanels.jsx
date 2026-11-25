import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../../../api/client'
import { getUser } from '../../../../api/auth'
import { getLanguage, useT, dateLocale } from '../../../../i18n'
import { downloadFromApi } from '../../../../utils/download'
import { errorText, euro, humanize, statusTone } from './zylaxFormat'
import { translateServer } from '../../../../i18n/serverMessages'
import ClockCard from '../clock/ClockCard'

export function ClockPanel({ onChange }) {
  return <ClockCard showLeave onChange={onChange} />
}

export function MusterPanel({ onChange }) {
  const t = useT()
  const role = getUser()?.role
  const canRoster = ['admin', 'hr', 'manager'].includes(role)
  const [active, setActive] = useState([])
  const [roster, setRoster] = useState({})
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await api.get('/zylax/hub/safety/emergencies', { params: { status: 'ACTIVE' } })
      const list = response.data?.data || []
      setActive(list)
      if (canRoster) {
        const entries = await Promise.all(list.map((item) => api.get(`/zylax/hub/safety/roster/${item.record_id}`).then((result) => [item.record_id, result.data])))
        setRoster(Object.fromEntries(entries))
      }
    } catch {
      setActive([])
    }
  }, [canRoster])
  useEffect(() => {
    load()
  }, [load])

  const checkIn = async (emergency, state) => {
    try {
      await api.post('/zylax/hub/safety/musters', { emergency, state })
      setMessage(t('Your status has been recorded.'))
      await load()
      onChange?.()
    } catch (error) {
      setMessage(errorText(error, t('The action could not be completed.')))
    }
  }

  if (!active.length) return <div className="zh-panel"><strong>{t('No active emergencies')}</strong></div>
  return active.map((item) => {
    const summary = roster[item.record_id]?.meta
    return (
      <div key={item.record_id} className="zh-panel zh-alert" role="alert">
        <div>
          <strong>{t('EMERGENCY')}: {item.title}</strong>
          <small>{item.data.location} · {item.data.instructions}</small>
          {message && <small role="status">{translateServer(message)}</small>}
          {summary && <small>{t('Safe')}: {summary.safe} · {t('Needs help')}: {summary.needs_help} · {t('Off site')}: {summary.off_site} · {t('Unaccounted')}: {summary.unaccounted} / {summary.total}</small>}
        </div>
        <div className="zx-form-actions">
          <button type="button" className="primary-action" onClick={() => checkIn(item.record_id, 'SAFE')}>{t('I am safe')}</button>
          <button type="button" onClick={() => checkIn(item.record_id, 'NEEDS_HELP')}>{t('I need help')}</button>
          <button type="button" onClick={() => checkIn(item.record_id, 'OFF_SITE')}>{t('Off site')}</button>
        </div>
      </div>
    )
  })
}

export function OrgChart({ rows }) {
  const t = useT()
  const tree = useMemo(() => {
    const byUser = new Map(rows.map((row) => [Number(row.data.user), row]))
    const children = new Map()
    const roots = []
    for (const row of rows) {
      const manager = Number(row.data.manager)
      if (manager && manager !== Number(row.data.user) && byUser.has(manager)) {
        children.set(manager, [...(children.get(manager) || []), row])
      } else roots.push(row)
    }
    return { roots, children }
  }, [rows])

  const renderNode = (row, seen) => {
    const id = Number(row.data.user)
    if (seen.has(id)) return null
    const nextSeen = new Set(seen).add(id)
    return (
      <li key={row.record_id}>
        <span className="zh-person"><strong>{row.title}</strong><small>{row.data.job_title}</small></span>
        {tree.children.get(id)?.length > 0 && <ul>{tree.children.get(id).map((child) => renderNode(child, nextSeen))}</ul>}
      </li>
    )
  }
  if (!rows.length) return null
  return <div className="zh-panel zh-org"><h3>{t('Organisation chart')}</h3><ul>{tree.roots.map((row) => renderNode(row, new Set()))}</ul></div>
}

export function CatalogPanel({ portal }) {
  const t = useT()
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)
  const [qty, setQty] = useState(1)
  const [message, setMessage] = useState('')
  const canRequest = portal === 'extranet' && ['client', 'partner'].includes(getUser()?.role)

  useEffect(() => {
    api.get('/zylax/hub/catalog', { params: { q: search || undefined } }).then((response) => setItems(response.data?.data || [])).catch(() => {})
  }, [search])

  const requestQuote = async (item) => {
    try {
      await api.post('/zylax/hub/contacts_quotes/rfqs', { title: `${t('Quote request')}: ${item.name}`.slice(0, 255), product: item.product_id, qty: Number(qty) })
      setMessage(t('Request sent. Our team will prepare your quote.'))
      setOpen(null)
    } catch (error) {
      setMessage(errorText(error, t('The action could not be completed.')))
    }
  }

  return (
    <div>
      {message && <div className="cloud-notice" role="status">{translateServer(message)}</div>}
      <div className="zx-toolbar"><input type="search" aria-label={t('Search products')} placeholder={t('Search products...')} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="zh-grid">
        {items.map((item) => (
          <article key={item.product_id} className="zh-product">
            <small>{item.category} · {item.sku}</small>
            <strong>{item.name}</strong>
            {item.description && <p>{item.description}</p>}
            <div className="zh-price"><b>{euro(item.unit_price_eur)}</b><span className={`zx-pill ${item.in_stock ? 'zx-accepted' : 'zx-rejected'}`}>{t(item.in_stock ? 'In stock' : 'Out of stock')}</span></div>
            {item.specifications && <details><summary>{t('Technical specifications')}</summary><p>{item.specifications}</p></details>}
            {canRequest && (open === item.product_id ? (
              <div className="zh-rfq">
                <input type="number" min="1" step="1" aria-label={t('Quantity')} value={qty} onChange={(event) => setQty(event.target.value)} />
                <button type="button" className="primary-action" disabled={!(Number(qty) > 0)} onClick={() => requestQuote(item)}>{t('Send')}</button>
              </div>
            ) : <button type="button" className="zh-secondary" onClick={() => { setOpen(item.product_id); setQty(1) }}>{t('Request quote')}</button>)}
          </article>
        ))}
      </div>
      {!items.length && <p className="zx-empty">{t('Nothing here yet.')}</p>}
    </div>
  )
}

export function PosPanel() {
  const t = useT()
  const role = getUser()?.role
  const external = ['client', 'partner'].includes(role)
  const canSell = ['admin', 'manager', 'employee'].includes(role)
  const canPay = ['admin', 'finance'].includes(role)
  const canRefund = ['admin', 'finance', 'manager'].includes(role)
  const [products, setProducts] = useState([])
  const [invoices, setInvoices] = useState([])
  const [cart, setCart] = useState({})
  const [method, setMethod] = useState('CARD')
  const [customer, setCustomer] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [readers, setReaders] = useState([])
  const [readerId, setReaderId] = useState('')
  const [waiting, setWaiting] = useState(null)

  useEffect(() => {
    if (!canSell) return
    api.get('/zylax/hub/pos/terminal/readers')
      .then((response) => {
        const list = response.data?.data || []
        setReaders(list)
        setReaderId((current) => current || list[0]?.id || '')
      })
      .catch(() => setReaders([]))
  }, [canSell])

  const load = useCallback(async () => {
    const [items, bills] = await Promise.all([
      external ? Promise.resolve(null) : api.get('/zylax/hub/catalog'),
      api.get(external ? '/zylax/hub/pos/my-invoices' : '/zylax/hub/pos/invoices'),
    ])
    if (items) setProducts(items.data?.data || [])
    setInvoices(bills.data?.data || [])
  }, [external])
  useEffect(() => {
    load().catch(() => {})
  }, [load])

  // While the customer pays on the card reader, check every 2 seconds (up to 3 minutes).
  useEffect(() => {
    if (!waiting) return undefined
    const started = Date.now()
    const timer = setInterval(async () => {
      try {
        const response = await api.get(`/zylax/hub/pos/invoices/${waiting.invoice_id}/terminal`)
        const { invoice_status: status, payment_status: payment } = response.data?.data || {}
        if (status === 'PAID') {
          setMessage(`${t('Card payment received')}: ${waiting.invoice_number}`)
          setWaiting(null)
          load().catch(() => {})
        } else if (payment === 'FAILED') {
          setMessage(t('The card payment failed or was cancelled. Try again or choose another method.'))
          setWaiting(null)
        } else if (Date.now() - started > 3 * 60 * 1000) {
          setMessage(t('No answer from the card reader yet. Check the reader, then look at the invoice list.'))
          setWaiting(null)
        }
      } catch {
        // Keep waiting; the network may be briefly unavailable.
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [waiting, load, t])

  const lines = products.filter((item) => cart[item.product_id]).map((item) => ({ ...item, qty: cart[item.product_id] }))
  const total = lines.reduce((sum, line) => sum + Math.round(line.qty * line.unit_price_eur * (100 + Number(line.tax_rate))) / 100, 0)
  const change = (id, delta) => setCart((current) => {
    const qty = Math.max(0, (current[id] || 0) + delta)
    const next = { ...current }
    if (qty) next[id] = qty
    else delete next[id]
    return next
  })
  const act = async (work, done) => {
    setBusy(true)
    try {
      const response = await work()
      setMessage(done(response.data.data))
      await load()
      return true
    } catch (error) {
      setMessage(errorText(error, t('The action could not be completed.')))
      return false
    } finally {
      setBusy(false)
    }
  }
  const charge = async () => {
    const items = lines.map((line) => ({ product_id: line.product_id, qty: line.qty }))
    if (method === 'TERMINAL') {
      setBusy(true)
      try {
        const sale = await api.post('/zylax/hub/pos/sales', { items, payment_method: 'TERMINAL', customer_name: customer || null })
        const invoice = sale.data.data
        await api.post(`/zylax/hub/pos/invoices/${invoice.invoice_id}/terminal`, { reader_id: readerId })
        setCart({})
        setCustomer('')
        setMessage(t('Ask the customer to present their card.'))
        setWaiting({ invoice_id: invoice.invoice_id, invoice_number: invoice.invoice_number })
        await load()
      } catch (error) {
        setMessage(errorText(error, t('The action could not be completed.')))
      } finally {
        setBusy(false)
      }
      return
    }
    const ok = await act(() => api.post('/zylax/hub/pos/sales', { items, payment_method: method, customer_name: customer || null }), (invoice) => `${t('Sale completed')}: ${invoice.invoice_number}`)
    if (ok) {
      setCart({})
      setCustomer('')
    }
  }

  const cancelCard = async () => {
    if (!waiting) return
    try {
      await api.post(`/zylax/hub/pos/invoices/${waiting.invoice_id}/terminal/cancel`, { reader_id: readerId })
      setMessage(t('Card payment cancelled.'))
    } catch (error) {
      setMessage(errorText(error, t('The action could not be completed.')))
    }
    setWaiting(null)
  }

  return (
    <div>
      {message && <div className="cloud-notice" role="status">{translateServer(message)}</div>}
      {canSell && (
        <div className="zh-pos">
          <div className="zh-grid">
            {products.map((item) => (
              <button key={item.product_id} type="button" className="zh-product zh-tile" disabled={!item.in_stock} onClick={() => change(item.product_id, 1)}>
                <small>{item.sku}</small><strong>{item.name}</strong><b>{euro(item.unit_price_eur)}</b>
              </button>
            ))}
          </div>
          <aside className="zh-panel zh-cart">
            <h3>{t('Current sale')}</h3>
            {lines.map((line) => (
              <div key={line.product_id} className="zh-cart-line">
                <span>{line.name}</span>
                <span><button type="button" aria-label={t('Remove one')} onClick={() => change(line.product_id, -1)}>−</button> {line.qty} <button type="button" aria-label={t('Add one')} onClick={() => change(line.product_id, 1)}>＋</button></span>
              </div>
            ))}
            {!lines.length && <small>{t('Tap products to add them.')}</small>}
            <input aria-label={t('Customer name')} placeholder={t('Customer name (optional)')} value={customer} maxLength="255" onChange={(event) => setCustomer(event.target.value)} />
            <select aria-label={t('Payment method')} value={method} onChange={(event) => setMethod(event.target.value)}>
              {readers.length > 0 && <option value="TERMINAL">{t('Card reader')}</option>}
              {['CARD', 'CASH', 'TRANSFER'].map((option) => <option key={option} value={option}>{t(option === 'CARD' ? 'Card (separate machine)' : humanize(option))}</option>)}
            </select>
            {method === 'TERMINAL' && readers.length > 1 && (
              <select aria-label={t('Card reader')} value={readerId} onChange={(event) => setReaderId(event.target.value)}>
                {readers.map((reader) => <option key={reader.id} value={reader.id}>{reader.label}</option>)}
              </select>
            )}
            <div className="zh-total"><span>{t('Total with VAT')}</span><strong>{euro(total)}</strong></div>
            {waiting
              ? <button type="button" onClick={cancelCard}>{t('Cancel card payment')}</button>
              : <button type="button" className="primary-action" disabled={busy || !lines.length} onClick={charge}>{t('Charge')}</button>}
          </aside>
        </div>
      )}
      <h3 className="zx-heading">{t('Invoices')}</h3>
      <div className="zx-table-wrap zx-card">
        <table>
          <thead><tr><th>{t('Invoice')}</th><th>{t('Date')}</th><th>{t('Payment')}</th><th>{t('Total')}</th><th>{t('Status')}</th>{!external && <th />}</tr></thead>
          <tbody>
            {invoices.map((row) => (
              <tr key={row.invoice_id}>
                <td className="zx-mono">{row.invoice_number}{row.kind === 'CORRECTIVE' ? ` · ${t('Corrective')}` : ''} <button type="button" className="zx-link" aria-label={`${t('Download PDF')} ${row.invoice_number}`} onClick={() => downloadFromApi(`/zylax/hub/pos/${external ? 'my-invoices' : 'invoices'}/${row.invoice_id}/pdf?lang=${getLanguage()}`, `${row.invoice_number}.pdf`).catch(() => setMessage(t('Could not create the PDF.')))}>PDF</button></td><td>{new Date(row.created_at).toLocaleDateString(dateLocale())}</td><td>{row.payment_method ? t(humanize(row.payment_method)) : '—'}</td><td>{euro(row.total_eur)}</td>
                <td><span className={`zx-pill ${statusTone(row.status === 'ISSUED' ? 'OPEN' : row.status === 'REFUNDED' ? 'CANCELLED' : row.status)}`}>{t(humanize(row.status))}</span></td>
                {!external && (
                  <td>
                    {canPay && row.customer_org_id && <button type="button" className="zx-link" disabled={busy} onClick={() => act(() => api.post(`/zylax/hub/pos/invoices/${row.invoice_id}/email`, { lang: getLanguage() }).then((response) => ({ data: { data: response.data } })), () => t('Email sent.'))}>{t('Email to customer')}</button>}{' '}
                    {canPay && row.status === 'ISSUED' && row.kind !== 'CORRECTIVE' && <button type="button" className="zx-link" disabled={busy} onClick={() => { const reason = window.prompt(t('Reason for cancelling this invoice')); if (reason?.trim()) act(() => api.post(`/zylax/hub/pos/invoices/${row.invoice_id}/cancel`, { reason }), (invoice) => `${t('Invoice cancelled.')} ${t('Corrective invoice')}: ${invoice.corrective_invoice_number}`) }}>{t('Cancel invoice')}</button>}{' '}
                    {canPay && row.status === 'ISSUED' && row.kind !== 'CORRECTIVE' && <button type="button" className="zx-link" disabled={busy} onClick={() => act(() => api.post(`/zylax/hub/pos/invoices/${row.invoice_id}/pay`, { payment_method: 'TRANSFER' }), () => t('Payment recorded.'))}>{t('Record payment')}</button>}
                    {canRefund && row.status === 'PAID' && row.kind !== 'CORRECTIVE' && <button type="button" className="zx-link" disabled={busy} onClick={() => { const reason = window.prompt(t('Reason for the refund')); if (reason?.trim()) act(() => api.post(`/zylax/hub/pos/invoices/${row.invoice_id}/refund`, { reason }), (invoice) => `${t('Invoice refunded.')} ${t('Corrective invoice')}: ${invoice.corrective_invoice_number}`) }}>{t('Refund')}</button>}
                  </td>
                )}
              </tr>
            ))}
            {!invoices.length && <tr><td colSpan="6" className="zx-empty">{t('Nothing here yet.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

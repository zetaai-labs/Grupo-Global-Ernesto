import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import { getLanguage, useT, dateLocale } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import { downloadFromApi } from '../../../../../utils/download'
import { euro } from './format'
import StatusPill from './StatusPill'
import './Commercial.css'

const TABS = [
  ['quotes', 'Quotes'],
  ['orders', 'Orders'],
  ['products', 'Product Catalog'],
  ['contacts', 'Contacts'],
  ['customers', 'Customers'],
  ['distributors', 'Franchises & Distributors'],
]
const TERRITORIES = ['GLOBAL', 'SPAIN_EU', 'INDIA', 'UAE_DUBAI', 'LATAM', 'USA_CAN', 'MOROCCO']
const STATUS_ACTION = { PROCESSING: 'Start processing', SHIPPED: 'Mark shipped', DELIVERED: 'Mark delivered', CANCELLED: 'Cancel order' }
const inDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
const EMPTY_PRODUCT = { sku: '', name: '', category: 'General', unit_price_eur: '', tax_rate: 21, stock_qty: 0, description: '', specifications: '' }
const EMPTY_CONTACT = { org_id: '', full_name: '', email: '', phone: '', job_title: '' }
const EMPTY_DISTRIBUTOR = { org_id: '', kind: 'DISTRIBUTOR', territory: 'SPAIN_EU', discount_pct: 0 }
const emptyQuote = () => ({ customer_org_id: '', contact_id: '', valid_until: inDays(30), notes: '', lines: [{ product_id: '', qty: 1, discount_pct: '' }] })


function Commercial() {
  const t = useT()
  const role = getUser()?.role
  const canSell = ['admin', 'manager', 'employee'].includes(role)
  const canManage = ['admin', 'manager'].includes(role)

  const [tab, setTab] = useState('quotes')
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({})
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [contacts, setContacts] = useState([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const fail = (error, fallback) => setNotice(translateServer(error.response?.data?.message) || t(fallback))

  const load = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([
        api.get(`/zylax/${tab}`, { params: { q: search || undefined, active: tab === 'products' ? 'all' : undefined } }),
        api.get('/zylax/summary'),
      ])
      setRows(list.data?.data || [])
      setSummary(stats.data?.data || {})
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message || 'Could not load this page.'))
    }
  }, [tab, search])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    Promise.all([api.get('/zylax/customers'), api.get('/zylax/products'), api.get('/zylax/contacts')])
      .then(([orgs, items, people]) => {
        setCustomers(orgs.data?.data || [])
        setProducts(items.data?.data || [])
        setContacts(people.data?.data || [])
      })
      .catch(() => {})
  }, [tab])

  const switchTab = (next) => {
    if (next === tab) return
    setTab(next)
    setRows([])
    setForm(null)
    setDetail(null)
    setSearch('')
  }

  const startCreate = () => {
    setDetail(null)
    setForm({ quotes: emptyQuote(), products: EMPTY_PRODUCT, contacts: EMPTY_CONTACT, distributors: EMPTY_DISTRIBUTOR }[tab])
  }

  const editProduct = (row) => {
    setDetail(null)
    setForm({ _id: row.product_id, sku: row.sku, name: row.name, category: row.category, unit_price_eur: row.unit_price_eur, tax_rate: row.tax_rate, stock_qty: row.stock_qty, description: row.description || '', specifications: row.specifications || '' })
  }

  const editCustomer = (row) => {
    setDetail(null)
    setForm({ _id: row.org_id, legal_name: row.legal_name, billing_address: row.billing_address || '' })
  }

  const editContact = (row) => {
    setDetail(null)
    setForm({ _id: row.contact_id, org_id: row.org_id, full_name: row.full_name, email: row.email || '', phone: row.phone || '', job_title: row.job_title || '' })
  }

  const editQuote = () => {
    setForm({
      _id: detail.quote_id, customer_org_id: detail.customer_org_id, contact_id: detail.contact_id || '', valid_until: detail.valid_until, notes: detail.notes || '',
      lines: detail.lines.map((line) => ({ product_id: line.product_id, qty: line.qty, discount_pct: Number(line.discount_pct) })),
    })
    setDetail(null)
  }

  const openDetail = async (kind, id) => {
    try {
      const response = await api.get(`/zylax/${kind}/${id}`)
      setForm(null)
      setDetail({ kind, ...response.data.data })
    } catch (error) {
      fail(error, 'Could not open this record.')
    }
  }

  const act = async (work, message, reopen) => {
    setBusy(true)
    try {
      const result = await work()
      setNotice(t(message))
      await load()
      if (reopen) await openDetail(reopen.kind, reopen.id)
      return result
    } catch (error) {
      fail(error, 'The action could not be completed.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    const { _id: editingId, ...values } = form
    let body = { ...values }
    if (tab === 'customers') body = { billing_address: values.billing_address }
    if (tab === 'quotes') {
      body = {
        ...body,
        contact_id: body.contact_id || null,
        lines: body.lines.map((line) => ({
          product_id: line.product_id,
          qty: Number(line.qty),
          ...(line.discount_pct === '' ? {} : { discount_pct: Number(line.discount_pct) }),
        })),
      }
    }
    if (tab === 'contacts') body = { ...body, email: body.email || null, phone: body.phone || null, job_title: body.job_title || null }
    if (tab === 'products') body = { ...body, description: body.description || null, specifications: body.specifications || null }
    const save = () => {
      if (!editingId) return api.post(`/zylax/${tab}`, body)
      return tab === 'quotes' ? api.put(`/zylax/quotes/${editingId}`, body) : api.patch(`/zylax/${tab}/${editingId}`, body)
    }
    const done = await act(save, 'Saved.')
    if (done) {
      setForm(null)
      if (tab === 'quotes') await openDetail('quotes', done.data.data.quote_id)
    }
  }

  const field = (key) => ({ value: form?.[key] ?? '', onChange: (event) => setForm({ ...form, [key]: event.target.value }) })
  const setLine = (index, patch) => setForm({ ...form, lines: form.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) })
  const customerContacts = contacts.filter((contact) => contact.org_id === form?.customer_org_id)
  const canCreate = tab === 'quotes' || tab === 'contacts' ? canSell : canManage && !['orders', 'customers'].includes(tab)

  const customerSelect = (key) => (
    <select required {...field(key)} aria-label={t('Customer')}>
      <option value="">{t('Select customer')}</option>
      {customers.map((org) => <option key={org.org_id} value={org.org_id}>{org.legal_name}</option>)}
    </select>
  )

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">ZYLAX</div>
          <h1>{t('Commercial')}</h1>
          <p>{t('Products, customers, quotes and orders in one flow, from first offer to delivery.')}</p>
        </div>
        {canCreate && <button type="button" className="primary-action" onClick={startCreate}>＋ {t('New')}</button>}
      </div>

      <div className="feature-stats">
        <div className="stat-card"><div className="stat-top"><span>{t('Open quotes')}</span><span className="stat-icon">✎</span></div><strong>{summary.open_quotes ?? 0}</strong><small>{t('Waiting for the customer')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Active orders')}</span><span className="stat-icon">▣</span></div><strong>{summary.active_orders ?? 0}</strong><small>{t('Not yet delivered')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Order value')}</span><span className="stat-icon">€</span></div><strong>{euro(summary.order_value_eur)}</strong><small>{t('Excludes cancelled orders')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Low stock')}</span><span className="stat-icon">!</span></div><strong>{summary.low_stock ?? 0}</strong><small>{t('{count} active products', { count: summary.products ?? 0 })}</small></div>
      </div>

      {notice && (
        <div className="cloud-notice zx-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label={t('Dismiss')}>✕</button>
        </div>
      )}

      <div className="zx-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => switchTab(key)}>{t(label)}</button>
        ))}
      </div>

      {form && (
        <form className="zx-form" onSubmit={submit}>
          {tab === 'products' && (
            <>
              <input required placeholder={t('SKU')} {...field('sku')} />
              <input required placeholder={t('Product name')} {...field('name')} />
              <input placeholder={t('Category')} {...field('category')} />
              <label>{t('Price (EUR)')}<input required type="number" min="0" step="0.01" {...field('unit_price_eur')} /></label>
              <label>{t('VAT %')}<input required type="number" min="0" max="100" step="0.01" {...field('tax_rate')} /></label>
              <label>{t('Stock')}<input required type="number" min="0" step="1" {...field('stock_qty')} /></label>
              <textarea rows="2" placeholder={t('Description')} {...field('description')} />
              <textarea rows="3" placeholder={t('Technical specifications')} {...field('specifications')} />
            </>
          )}
          {tab === 'customers' && (
            <>
              <strong className="zx-wide">{form.legal_name}</strong>
              <textarea required minLength="5" maxLength="500" rows="2" aria-label={t('Billing address')} placeholder={t('Billing address')} {...field('billing_address')} />
            </>
          )}
          {tab === 'contacts' && (
            <>
              {customerSelect('org_id')}
              <input required placeholder={t('Full name')} {...field('full_name')} />
              <input type="email" placeholder={t('Email')} {...field('email')} />
              <input placeholder={t('Phone')} {...field('phone')} />
              <input placeholder={t('Job title')} {...field('job_title')} />
            </>
          )}
          {tab === 'distributors' && (
            <>
              {customerSelect('org_id')}
              <select {...field('kind')} aria-label={t('Type')}><option value="DISTRIBUTOR">{t('Distributor')}</option><option value="FRANCHISE">{t('Franchise')}</option></select>
              <select {...field('territory')} aria-label={t('Territory')}>{TERRITORIES.map((code) => <option key={code} value={code}>{code}</option>)}</select>
              <label>{t('Agreed discount %')}<input type="number" min="0" max="40" step="0.01" {...field('discount_pct')} /></label>
            </>
          )}
          {tab === 'quotes' && (
            <>
              <select required value={form.customer_org_id} aria-label={t('Customer')} onChange={(event) => setForm({ ...form, customer_org_id: event.target.value, contact_id: '' })}>
                <option value="">{t('Select customer')}</option>
                {customers.map((org) => <option key={org.org_id} value={org.org_id}>{org.legal_name}</option>)}
              </select>
              <select {...field('contact_id')} aria-label={t('Contact')}>
                <option value="">{t('No contact')}</option>
                {customerContacts.map((contact) => <option key={contact.contact_id} value={contact.contact_id}>{contact.full_name}</option>)}
              </select>
              <label>{t('Valid until')}<input required type="date" min={inDays(0)} {...field('valid_until')} /></label>
              <div className="zx-lines">
                {form.lines.map((line, index) => (
                  <div key={index} className="zx-line">
                    <select required value={line.product_id} aria-label={t('Product')} onChange={(event) => setLine(index, { product_id: event.target.value })}>
                      <option value="">{t('Select product')}</option>
                      {products.map((item) => <option key={item.product_id} value={item.product_id}>{item.sku} · {item.name} · {euro(item.unit_price_eur)}</option>)}
                    </select>
                    <input required type="number" min="1" step="1" value={line.qty} aria-label={t('Quantity')} onChange={(event) => setLine(index, { qty: event.target.value })} />
                    <input type="number" min="0" max="100" step="0.01" placeholder={t('Disc. %')} value={line.discount_pct} aria-label={t('Discount')} onChange={(event) => setLine(index, { discount_pct: event.target.value })} />
                    <button type="button" disabled={form.lines.length === 1} aria-label={t('Remove line')} onClick={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) })}>✕</button>
                  </div>
                ))}
                <button type="button" className="zx-add" onClick={() => setForm({ ...form, lines: [...form.lines, { product_id: '', qty: 1, discount_pct: '' }] })}>＋ {t('Add product')}</button>
              </div>
              <textarea rows="2" placeholder={t('Notes for the customer')} {...field('notes')} />
            </>
          )}
          <div className="zx-form-actions">
            <button type="submit" className="primary-action" disabled={busy}>{t('Save')}</button>
            <button type="button" onClick={() => setForm(null)}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      {detail && (
        <article className="zx-detail">
          <header>
            <div>
              <h3>{detail.kind === 'quotes' ? detail.quote_number : detail.order_number} <StatusPill status={detail.status} /></h3>
              <p>{detail.customer}{detail.valid_until ? ` · ${t('Valid until')} ${detail.valid_until}` : ''}{detail.order_number && detail.kind === 'quotes' ? ` · ${detail.order_number}` : ''}</p>
            </div>
            <button type="button" onClick={() => setDetail(null)} aria-label={t('Close')}>✕</button>
          </header>
          <div className="zx-table-wrap">
            <table>
              <thead><tr><th>{t('Product')}</th><th>{t('Qty')}</th><th>{t('Price')}</th><th>{t('Disc. %')}</th><th>{t('Net')}</th><th>{t('VAT')}</th></tr></thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr key={line.line_id}><td>{line.sku} · {line.name}</td><td>{line.qty}</td><td>{euro(line.unit_price_eur)}</td><td>{Number(line.discount_pct)}</td><td>{euro(line.net_eur)}</td><td>{euro(line.tax_eur)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="zx-totals"><span>{t('Net')} {euro(detail.net_eur)}</span><span>{t('VAT')} {euro(detail.tax_eur)}</span><strong>{t('Total')} {euro(detail.total_eur)}</strong></div>
          {detail.notes && <p className="zx-note">{detail.notes}</p>}
          {detail.events && (
            <ol className="zx-timeline">
              {detail.events.map((event) => <li key={event.event_id}><StatusPill status={event.status} /> <span>{new Date(event.created_at).toLocaleString(dateLocale())} · {event.author || t('System')}</span></li>)}
            </ol>
          )}
          <div className="zx-form-actions">
            {detail.kind === 'quotes' && (
              <button type="button" disabled={busy} onClick={() => downloadFromApi(`/zylax/quotes/${detail.quote_id}/pdf?lang=${getLanguage()}`, `${detail.quote_number}.pdf`).catch(() => setNotice(t('Could not create the PDF.')))}>{t('Download PDF')}</button>
            )}
            {detail.kind === 'quotes' && detail.can_edit && detail.status !== 'DRAFT' && (
              <button type="button" disabled={busy} onClick={() => act(() => api.post(`/zylax/quotes/${detail.quote_id}/email`, { lang: getLanguage() }), 'Email sent.')}>{t('Email to customer')}</button>
            )}
            {detail.kind === 'quotes' && detail.can_edit && detail.status === 'DRAFT' && <button type="button" onClick={editQuote}>{t('Edit')}</button>}
            {detail.kind === 'orders' && ['admin', 'manager', 'finance'].includes(role) && detail.status !== 'CANCELLED' && (
              <button type="button" disabled={busy} onClick={() => act(() => api.post(`/zylax/hub/pos/orders/${detail.order_id}/invoice`), 'Invoice issued.', { kind: 'orders', id: detail.order_id })}>{t('Create invoice')}</button>
            )}
            {detail.kind === 'quotes' && detail.can_edit && detail.status === 'DRAFT' && (
              <button type="button" className="primary-action" disabled={busy} onClick={() => act(() => api.post(`/zylax/quotes/${detail.quote_id}/send`), 'Quote sent to the customer.', { kind: 'quotes', id: detail.quote_id })}>{t('Send to customer')}</button>
            )}
            {detail.kind === 'quotes' && detail.can_edit && detail.status === 'SENT' && (
              <>
                <button type="button" className="primary-action" disabled={busy} onClick={() => act(() => api.post(`/zylax/quotes/${detail.quote_id}/accept`), 'Order created.', { kind: 'quotes', id: detail.quote_id })}>{t('Accept for customer')}</button>
                <button type="button" disabled={busy} onClick={() => act(() => api.post(`/zylax/quotes/${detail.quote_id}/reject`), 'Quote declined.', { kind: 'quotes', id: detail.quote_id })}>{t('Decline')}</button>
              </>
            )}
            {detail.kind === 'orders' && detail.can_manage && detail.next_statuses.map((status) => (
              <button
                key={status}
                type="button"
                className={status === 'CANCELLED' ? '' : 'primary-action'}
                disabled={busy}
                onClick={() => {
                  if (status === 'CANCELLED' && !window.confirm(t('Cancel this order and return its items to stock?'))) return
                  act(() => api.patch(`/zylax/orders/${detail.order_id}/status`, { status }), 'Order updated.', { kind: 'orders', id: detail.order_id })
                }}
              >{t(STATUS_ACTION[status])}</button>
            ))}
          </div>
        </article>
      )}

      <div className="zx-toolbar">
        {tab !== 'distributors' && <input type="search" placeholder={t('Search...')} value={search} onChange={(event) => setSearch(event.target.value)} />}
      </div>

      <div className="zx-table-wrap zx-card">
        <table>
          {tab === 'quotes' && <thead><tr><th>{t('Quote')}</th><th>{t('Customer')}</th><th>{t('Valid until')}</th><th>{t('Total')}</th><th>{t('Status')}</th></tr></thead>}
          {tab === 'orders' && <thead><tr><th>{t('Order')}</th><th>{t('Customer')}</th><th>{t('Quote')}</th><th>{t('Total')}</th><th>{t('Status')}</th></tr></thead>}
          {tab === 'products' && <thead><tr><th>{t('SKU')}</th><th>{t('Product')}</th><th>{t('Category')}</th><th>{t('Price')}</th><th>{t('Stock')}</th><th>{t('Status')}</th></tr></thead>}
          {tab === 'contacts' && <thead><tr><th>{t('Name')}</th><th>{t('Company')}</th><th>{t('Job title')}</th><th>{t('Email')}</th><th>{t('Phone')}</th></tr></thead>}
          {tab === 'customers' && <thead><tr><th>{t('Company')}</th><th>{t('Tax ID')}</th><th>{t('Country')}</th><th>{t('Billing address')}</th></tr></thead>}
          {tab === 'distributors' && <thead><tr><th>{t('Company')}</th><th>{t('Type')}</th><th>{t('Territory')}</th><th>{t('Discount')}</th><th>{t('Order value')}</th><th>{t('Status')}</th></tr></thead>}
          <tbody>
            {tab === 'quotes' && rows.map((row) => <tr key={row.quote_id} className="zx-click" onClick={() => openDetail('quotes', row.quote_id)}><td className="zx-mono">{row.quote_number}</td><td>{row.customer}</td><td>{row.valid_until}</td><td>{euro(row.total_eur)}</td><td><StatusPill status={row.status} /></td></tr>)}
            {tab === 'orders' && rows.map((row) => <tr key={row.order_id} className="zx-click" onClick={() => openDetail('orders', row.order_id)}><td className="zx-mono">{row.order_number}</td><td>{row.customer}</td><td className="zx-mono">{row.quote_number}</td><td>{euro(row.total_eur)}</td><td><StatusPill status={row.status} /></td></tr>)}
            {tab === 'products' && rows.map((row) => (
              <tr key={row.product_id}>
                <td className="zx-mono">{canManage ? <button type="button" className="zx-link" onClick={() => editProduct(row)}>{row.sku}</button> : row.sku}</td><td>{row.name}</td><td>{row.category}</td><td>{euro(row.unit_price_eur)}</td>
                <td className={row.stock_qty <= 5 ? 'zx-low' : ''}>{row.stock_qty}</td>
                <td>
                  {canManage
                    ? <button type="button" className="zx-link" disabled={busy} onClick={() => act(() => api.patch(`/zylax/products/${row.product_id}`, { active: !row.active }), 'Product updated.')}>{t(row.active ? 'Active' : 'Inactive')}</button>
                    : t(row.active ? 'Active' : 'Inactive')}
                </td>
              </tr>
            ))}
            {tab === 'contacts' && rows.map((row) => <tr key={row.contact_id}><td>{canSell ? <button type="button" className="zx-link" onClick={() => editContact(row)}>{row.full_name}</button> : row.full_name}</td><td>{row.organization}</td><td>{row.job_title || '—'}</td><td>{row.email || '—'}</td><td>{row.phone || '—'}</td></tr>)}
            {tab === 'customers' && rows.map((row) => (
              <tr key={row.org_id}>
                <td>{['admin', 'manager', 'finance'].includes(role) ? <button type="button" className="zx-link" onClick={() => editCustomer(row)}>{row.legal_name}</button> : row.legal_name}</td>
                <td className="zx-mono">{row.tax_id}</td><td>{row.country}</td>
                <td className={row.billing_address ? '' : 'zx-low'}>{row.billing_address || t('Missing')}</td>
              </tr>
            ))}
            {tab === 'distributors' && rows.map((row) => (
              <tr key={row.distributor_id}>
                <td>{row.organization}</td><td>{t(row.kind === 'FRANCHISE' ? 'Franchise' : 'Distributor')}</td><td>{row.territory}</td><td>{Number(row.discount_pct)}%</td><td>{euro(row.order_value_eur)}</td>
                <td>
                  {canManage
                    ? <button type="button" className="zx-link" disabled={busy} onClick={() => act(() => api.patch(`/zylax/distributors/${row.distributor_id}`, { status: row.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }), 'Distributor updated.')}>{t(row.status)}</button>
                    : t(row.status)}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="6" className="zx-empty">{t('Nothing here yet.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default Commercial

import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { useT, dateLocale } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import { euro } from '../Commercial/format'
import '../Commercial/Commercial.css'
import '../../../Shared/MatchSuggestions.css'
import MembershipRevenue from './MembershipRevenue'

const TABS = [['subscriptions', 'Subscriptions'], ['memberships', 'Memberships'], ['plans', 'Plans'], ['payments', 'Online payments'], ['risk', 'Renewal risk']]
const PER = { MONTH: 'month', YEAR: 'year', YEARS_2: '2 years', YEARS_3: '3 years' }
const today = () => new Date().toISOString().slice(0, 10)
const EMPTY_PLAN = { code: '', name: '', billing_interval: 'MONTH', amount_eur: '', tax_rate: 21, description: '', category: 'SERVICE' }
const tone = { ACTIVE: 'zx-accepted', COMPLETED: 'zx-accepted', PAST_DUE: 'zx-expired', CANCELED: 'zx-rejected', FAILED: 'zx-rejected', DUPLICATE: 'zx-expired', CREATED: 'zx-sent' }

function Billing() {
  const t = useT()
  const [tab, setTab] = useState('subscriptions')
  const [metrics, setMetrics] = useState(null)
  const [rows, setRows] = useState([])
  const [plans, setPlans] = useState([])
  const [customers, setCustomers] = useState([])
  const [form, setForm] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      // The Memberships tab loads its own report.
      const [list, stats, planList] = await Promise.all([tab === 'memberships' ? null : api.get(`/billing/${tab}`), api.get('/billing/metrics'), api.get('/billing/plans')])
      setRows(list?.data?.data || [])
      setMetrics(stats.data?.data || null)
      setPlans(planList.data?.data || [])
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message || 'Could not load this page.'))
    }
  }, [tab])

  const runRisk = async () => {
    setBusy(true)
    try {
      const response = await api.post('/billing/risk/run')
      setNotice(translateServer(response.data?.message || 'Renewal risk updated.'))
      await load()
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message || 'Could not load this page.'))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api.get('/zylax/customers').then((response) => setCustomers(response.data?.data || [])).catch(() => {})
  }, [])

  const act = async (work, message) => {
    setBusy(true)
    try {
      const response = await work()
      setNotice(typeof message === 'function' ? message(response.data?.data) : t(message))
      setForm(null)
      await load()
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message) || t('The action could not be completed.'))
    } finally {
      setBusy(false)
    }
  }

  const field = (key) => ({ value: form?.[key] ?? '', onChange: (event) => setForm({ ...form, [key]: event.target.value }) })

  const submit = (event) => {
    event.preventDefault()
    if (tab === 'plans') {
      act(() => api.post('/billing/plans', { ...form, amount_eur: Number(form.amount_eur), tax_rate: Number(form.tax_rate), description: form.description || null }), 'Saved.')
    } else {
      act(() => api.post('/billing/subscriptions', form), (data) => `${t('Subscription started.')} ${t('Invoice')}: ${data?.invoice_number || ''}`)
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('FINANCE')}</div>
          <h1>{t('Billing')}</h1>
          <p>{t('Subscription plans, recurring invoices and online payments.')}</p>
        </div>
        <div className="zx-form-actions">
          {tab === 'risk' && <button type="button" className="primary-action" disabled={busy} onClick={runRisk}>{t('Recalculate risk')}</button>}
          {!['payments', 'risk', 'memberships'].includes(tab) && <button type="button" className="primary-action" onClick={() => setForm(tab === 'plans' ? EMPTY_PLAN : { org_id: '', plan_id: '', start_date: today() })}>＋ {t('New')}</button>}
          <button type="button" disabled={busy} onClick={() => act(() => api.post('/billing/run'), (data) => `${t('Billing run finished.')} ${t('Invoices')}: ${data?.invoices ?? 0}`)}>{t('Run billing now')}</button>
        </div>
      </div>

      {metrics && (
        <div className="feature-stats">
          <div className="stat-card"><div className="stat-top"><span>{t('Monthly recurring revenue')}</span><span className="stat-icon">€</span></div><strong>{euro(metrics.mrr_eur)}</strong><small>{t('Without VAT')}</small></div>
          <div className="stat-card"><div className="stat-top"><span>{t('Annual recurring revenue')}</span><span className="stat-icon">€</span></div><strong>{euro(metrics.arr_eur)}</strong><small>{t('MRR × 12')}</small></div>
          <div className="stat-card"><div className="stat-top"><span>{t('Active subscriptions')}</span><span className="stat-icon">✓</span></div><strong>{metrics.active}</strong><small>{t('{count} overdue', { count: metrics.past_due })}</small></div>
          <div className="stat-card"><div className="stat-top"><span>{t('Unpaid invoices')}</span><span className="stat-icon">!</span></div><strong>{metrics.open_invoices}</strong><small>{euro(metrics.open_amount_eur)}</small></div>
        </div>
      )}

      {notice && <div className="cloud-notice zx-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label={t('Dismiss')}>✕</button></div>}

      <div className="zx-tabs" role="tablist">
        {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => { if (key !== tab) { setTab(key); setRows([]); setForm(null) } }}>{t(label)}</button>)}
      </div>

      {form && (
        <form className="zx-form" onSubmit={submit}>
          {tab === 'plans' ? (
            <>
              <input required placeholder={t('Code')} maxLength="40" {...field('code')} />
              <input required placeholder={t('Plan name')} maxLength="150" {...field('name')} />
              <select aria-label={t('Billing interval')} {...field('billing_interval')}><option value="MONTH">{t('Monthly')}</option><option value="YEAR">{t('Yearly')}</option><option value="YEARS_2">{t('Every 2 years')}</option><option value="YEARS_3">{t('Every 3 years')}</option></select>
              <select aria-label={t('Plan type')} {...field('category')}><option value="SERVICE">{t('Service plan')}</option><option value="MEMBERSHIP">{t('Membership plan (shown at registration)')}</option></select>
              <label>{t('Price without VAT (EUR)')}<input required type="number" min="0" step="0.01" {...field('amount_eur')} /></label>
              <label>{t('VAT %')}<input required type="number" min="0" max="100" step="0.01" {...field('tax_rate')} /></label>
              <textarea rows="2" placeholder={t('Description')} {...field('description')} />
            </>
          ) : (
            <>
              <select required aria-label={t('Customer')} {...field('org_id')}><option value="">{t('Select customer')}</option>{customers.map((org) => <option key={org.org_id} value={org.org_id}>{org.legal_name}{org.billing_address ? '' : ` (${t('no billing address')})`}</option>)}</select>
              <select required aria-label={t('Plan')} {...field('plan_id')}><option value="">{t('Select plan')}</option>{plans.filter((plan) => plan.active).map((plan) => <option key={plan.plan_id} value={plan.plan_id}>{plan.name} · {euro(plan.amount_eur)} / {t(PER[plan.billing_interval] || 'month')}</option>)}</select>
              <label>{t('Start date')}<input required type="date" min={today()} {...field('start_date')} /></label>
            </>
          )}
          <div className="zx-form-actions"><button type="submit" className="primary-action" disabled={busy}>{t('Save')}</button><button type="button" onClick={() => setForm(null)}>{t('Cancel')}</button></div>
        </form>
      )}

      {tab === 'memberships' && <MembershipRevenue />}

      {tab !== 'memberships' && <div className="zx-table-wrap zx-card">
        <table>
          {tab === 'subscriptions' && <thead><tr><th>{t('Customer')}</th><th>{t('Plan')}</th><th>{t('Current period')}</th><th>{t('Status')}</th><th /></tr></thead>}
          {tab === 'plans' && <thead><tr><th>{t('Code')}</th><th>{t('Plan')}</th><th>{t('Price')}</th><th>{t('Subscriptions')}</th><th>{t('Status')}</th></tr></thead>}
          {tab === 'risk' && <thead><tr><th>{t('Member')}</th><th>{t('Risk')}</th><th>{t('Why')}</th><th>{t('Updated')}</th></tr></thead>}
          {tab === 'payments' && <thead><tr><th>{t('Date')}</th><th>{t('Invoice')}</th><th>{t('Customer')}</th><th>{t('Provider')}</th><th>{t('Amount')}</th><th>{t('Status')}</th></tr></thead>}
          <tbody>
            {tab === 'subscriptions' && rows.map((row) => (
              <tr key={row.subscription_id}>
                <td>{row.organization}</td><td>{row.plan_name} · {euro(row.amount_eur)}</td>
                <td>{row.current_period_start} → {row.current_period_end}{row.cancel_at_period_end ? ` · ${t('ends then')}` : ''}</td>
                <td><span className={`zx-pill ${tone[row.status] || ''}`}>{t(row.status)}</span></td>
                <td>{row.status !== 'CANCELED' && !row.cancel_at_period_end && <button type="button" className="zx-link" disabled={busy} onClick={() => { if (window.confirm(t('End this subscription at the end of the current period?'))) act(() => api.post(`/billing/subscriptions/${row.subscription_id}/cancel`, {}), 'Subscription will end at the end of the period.') }}>{t('Cancel')}</button>}</td>
              </tr>
            ))}
            {tab === 'plans' && rows.map((row) => (
              <tr key={row.plan_id}>
                <td className="zx-mono">{row.code}</td><td>{t(row.name)}{row.category === 'MEMBERSHIP' ? ` · ${t('Membership')}` : ''}</td><td>{euro(row.amount_eur)} / {t(PER[row.billing_interval] || 'month')} + {Number(row.tax_rate)}% {t('VAT')}</td><td>{row.live_subscriptions}</td>
                <td><button type="button" className="zx-link" disabled={busy} onClick={() => act(() => api.patch(`/billing/plans/${row.plan_id}`, { active: !row.active }), 'Saved.')}>{t(row.active ? 'Active' : 'Inactive')}</button></td>
              </tr>
            ))}
            {tab === 'risk' && rows.map((row) => (
              <tr key={row.org_id}>
                <td>{row.legal_name}</td>
                <td><span className={`risk-pill risk-${row.level}`}>{t(row.level === 'HIGH' ? 'High' : row.level === 'MEDIUM' ? 'Medium' : 'Low')} · {row.score}%</span></td>
                <td><ul className="risk-reasons">{(row.reasons || []).map((reason) => <li key={reason.code}>{reason.direction === 'up' ? '▲' : '▼'} {reason.template ? t(reason.template, reason.params) : t(reason.text)}</li>)}</ul></td>
                <td>{new Date(row.computed_at).toLocaleString(dateLocale())}</td>
              </tr>
            ))}
            {tab === 'payments' && rows.map((row) => (
              <tr key={row.payment_id}>
                <td>{new Date(row.created_at).toLocaleString(dateLocale())}</td><td className="zx-mono">{row.invoice_number}</td><td>{row.organization}</td><td>{row.provider}</td><td>{euro(row.amount_eur)}</td>
                <td><span className={`zx-pill ${tone[row.status] || ''}`}>{t(row.status)}</span></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="6" className="zx-empty">{t('Nothing here yet.')}</td></tr>}
          </tbody>
        </table>
      </div>}
    </section>
  )
}

export default Billing

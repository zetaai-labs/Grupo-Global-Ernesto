import { useEffect, useState } from 'react'
import api from '../../api/client'
import { useT } from '../../i18n'
import { euro } from '../Portals/Shared/Zylax/zylaxFormat'

const YEARS = { YEAR: 1, YEARS_2: 2, YEARS_3: 3 }

/**
 * Registration step "Membership": new members choose a plan and answer the survey; existing direct
 * partners of Grupo Global answer the survey and name their contact (no fee). The survey and plans come
 * from the server, so Finance can change prices without a new release.
 */
function OnboardingMembership({ form, setForm }) {
  const t = useT()
  const [info, setInfo] = useState(null)

  useEffect(() => {
    api.get('/public/onboarding/membership').then((response) => setInfo(response.data.data)).catch(() => setInfo({ plans: [], survey: [] }))
  }, [])

  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const answer = (key, value) => setForm((current) => ({ ...current, survey: { ...current.survey, [key]: value } }))
  const member = form.membership_track === 'MEMBER'

  if (!info) return <p className="onboarding-muted">{t('Loading membership options…')}</p>

  return (
    <section className="onboarding-membership">
      <h2>{t('2. Membership')}</h2>
      <div className="om-track" role="radiogroup" aria-label={t('Membership')}>
        <label className={member ? 'on' : ''}>
          <input type="radio" name="membership_track" checked={member} onChange={() => set({ membership_track: 'MEMBER' })} />
          <span><strong>{t('New member')}</strong><small>{t('Join the Grupo Global network with a paid membership.')}</small></span>
        </label>
        <label className={!member ? 'on' : ''}>
          <input type="radio" name="membership_track" checked={!member} onChange={() => set({ membership_track: 'EXISTING_PARTNER' })} />
          <span><strong>{t('Existing Grupo Global partner')}</strong><small>{t('Already a direct partner: no membership fee. Compliance confirms it.')}</small></span>
        </label>
      </div>

      {member && (
        <>
          <div className="om-plans" role="radiogroup" aria-label={t('Membership plan')}>
            {info.plans.map((plan) => (
              <label key={plan.code} className={form.membership_plan_code === plan.code ? 'on' : ''}>
                <input type="radio" name="membership_plan" checked={form.membership_plan_code === plan.code} onChange={() => set({ membership_plan_code: plan.code })} />
                <strong>{t(YEARS[plan.billing_interval] === 1 ? '1 year' : '{n} years', { n: YEARS[plan.billing_interval] || 1 })}</strong>
                <span className="om-price">{euro(plan.amount_eur)}</span>
                <small>{t('+ {rate}% VAT = {total}', { rate: plan.tax_rate, total: euro(plan.total_eur) })}</small>
              </label>
            ))}
          </div>
          <label className="om-address">{t('Invoicing address')}
            <textarea rows="2" value={form.billing_address} onChange={(event) => set({ billing_address: event.target.value })} required placeholder={t('Street, number, postcode, city, country')} />
          </label>
          <p className="onboarding-muted">{t('You pay only after Compliance approves your company: the invoice appears in your portal, payable by card (Stripe) or PayPal.')}</p>
        </>
      )}

      <fieldset className="om-survey">
        <legend>{t('About your company')}</legend>
        {info.survey.map((question) => {
          const value = form.survey[question.key]
          const required = question.required || (!member && question.key === 'referred_by')
          const label = !member && question.key === 'referred_by' ? t('Your contact at Grupo Global') : t(question.label)
          if (question.type === 'select') {
            return (
              <label key={question.key}>{label}
                <select value={value || ''} onChange={(event) => answer(question.key, event.target.value)} required={required}>
                  <option value="">{t('Choose…')}</option>
                  {question.options.map((option) => <option key={option} value={option}>{t(option)}</option>)}
                </select>
              </label>
            )
          }
          if (question.type === 'multi') {
            const chosen = value || []
            return (
              <div key={question.key} className="om-multi" role="group" aria-label={label}>
                <span>{label}</span>
                {question.options.map((option) => (
                  <label key={option}>
                    <input type="checkbox" checked={chosen.includes(option)}
                      onChange={(event) => answer(question.key, event.target.checked ? [...chosen, option] : chosen.filter((item) => item !== option))} />
                    {t(option)}
                  </label>
                ))}
              </div>
            )
          }
          const Field = question.type === 'textarea' ? 'textarea' : 'input'
          return (
            <label key={question.key} className={question.type === 'textarea' ? 'om-wide' : ''}>{label}
              <Field value={value || ''} maxLength={question.max} rows={question.type === 'textarea' ? 3 : undefined}
                onChange={(event) => answer(question.key, event.target.value)} required={required} />
            </label>
          )
        })}
      </fieldset>
    </section>
  )
}

export default OnboardingMembership

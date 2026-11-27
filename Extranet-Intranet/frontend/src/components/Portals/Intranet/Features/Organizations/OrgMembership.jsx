import { useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { useT } from '../../../../../i18n'
import { euro } from '../../../Shared/Zylax/zylaxFormat'

const YEARS = { YEAR: 1, YEARS_2: 2, YEARS_3: 3 }

/**
 * What the applicant chose (new member or existing partner, plan) and answered in the survey. While the
 * decision is open, Compliance can correct the choice; approving a member issues the first invoice.
 */
function OrgMembership({ org, editable, choice, onChoice }) {
  const t = useT()
  const application = org.application
  const [info, setInfo] = useState({ plans: [], survey: [] })

  useEffect(() => {
    api.get('/public/onboarding/membership').then((response) => setInfo(response.data.data)).catch(() => {})
  }, [])

  const track = choice?.org_id === org.org_id ? choice.membership_track : application.membership_track
  const planCode = choice?.org_id === org.org_id ? choice.membership_plan_code : application.membership_plan_code
  const change = (patch) => onChoice({ org_id: org.org_id, membership_track: track, membership_plan_code: planCode, ...patch })
  const answers = application.survey || {}
  const label = (key) => info.survey.find((question) => question.key === key)?.label || key
  const planLabel = (plan) => `${t(YEARS[plan.billing_interval] === 1 ? '1 year' : '{n} years', { n: YEARS[plan.billing_interval] || 1 })} · ${euro(plan.amount_eur)}`

  return (
    <section className="org-membership">
      <h3>{t('Membership')}</h3>
      {editable ? (
        <div className="org-membership-choice">
          <label>{t('Type')}
            <select value={track} onChange={(event) => change({ membership_track: event.target.value })}>
              <option value="MEMBER">{t('New member (pays membership)')}</option>
              <option value="EXISTING_PARTNER">{t('Existing Grupo Global partner (no fee)')}</option>
            </select>
          </label>
          {track === 'MEMBER' && (
            <label>{t('Plan')}
              <select value={planCode || ''} onChange={(event) => change({ membership_plan_code: event.target.value })}>
                <option value="">{t('Choose…')}</option>
                {info.plans.map((plan) => <option key={plan.code} value={plan.code}>{planLabel(plan)}</option>)}
              </select>
            </label>
          )}
          {track === 'MEMBER' && !org.billing_address && <p className="org-warning">{t('Add the invoicing address before approving.')}</p>}
          {track === 'MEMBER' && <p className="org-muted">{t('Approving starts the membership and sends the first invoice to the member’s portal.')}</p>}
        </div>
      ) : (
        <p>
          {track === 'MEMBER' ? t('New member (pays membership)') : t('Existing Grupo Global partner (no fee)')}
          {track === 'MEMBER' && application.membership_plan_name ? ` · ${t(application.membership_plan_name)}` : ''}
        </p>
      )}
      {Object.keys(answers).length > 0 && (
        <dl className="org-survey">
          {Object.entries(answers).map(([key, value]) => (
            <div key={key}>
              <dt>{t(label(key))}</dt>
              <dd>{Array.isArray(value) ? value.map((item) => t(item)).join(', ') : t(String(value))}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

export default OrgMembership

import { useState } from 'react'
import api from '../../api/client'
import { useT } from '../../i18n'

const ROLES = [
  ['DIRECTOR', 'Director'],
  ['REPRESENTATIVE', 'Legal representative'],
  ['BENEFICIAL_OWNER', 'Beneficial owner'],
]
const ROLE_LABELS = Object.fromEntries(ROLES)
const EMPTY = { full_name: '', person_role: 'DIRECTOR', ownership_pct: '', nationality: '', birth_year: '' }

/** Onboarding step 2b: the applicant declares directors, legal representatives and beneficial owners. */
function OnboardingPeople({ token, people, canEdit, onChange, onError }) {
  const t = useT()
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const add = async (event) => {
    event.preventDefault()
    setBusy(true)
    onError('')
    try {
      await api.post(`/public/onboarding/${token}/people`, {
        full_name: form.full_name,
        person_role: form.person_role,
        ownership_pct: form.ownership_pct === '' ? null : Number(form.ownership_pct),
        nationality: form.nationality || null,
        birth_year: form.birth_year === '' ? null : Number(form.birth_year),
      })
      setForm(EMPTY)
      await onChange()
    } catch (error) {
      onError(error.response?.data?.message || 'Could not add this person.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (personId) => {
    onError('')
    try {
      await api.delete(`/public/onboarding/${token}/people/${personId}`)
      await onChange()
    } catch (error) {
      onError(error.response?.data?.message || 'Could not remove this person.')
    }
  }

  return (
    <section className="onboarding-people">
      <h2>{t('Directors and owners')}</h2>
      <p className="onboarding-hint">{t('List your directors or legal representatives and every person who owns more than 25%. They are screened against sanctions and PEP lists.')}</p>
      {people.length > 0 && (
        <ul className="onboarding-people-list">
          {people.map((person) => (
            <li key={person.person_id}>
              <span>
                <strong>{person.full_name}</strong>
                <small>
                  {t(ROLE_LABELS[person.person_role])}
                  {person.ownership_pct !== null && person.ownership_pct !== undefined ? ` · ${Number(person.ownership_pct)}%` : ''}
                  {person.nationality ? ` · ${person.nationality}` : ''}
                  {person.birth_year ? ` · ${person.birth_year}` : ''}
                </small>
              </span>
              {canEdit && person.added_by_applicant && <button type="button" onClick={() => remove(person.person_id)}>{t('Remove')}</button>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form className="onboarding-grid onboarding-person-form" onSubmit={add}>
          <label>{t('Full name')}<input value={form.full_name} onChange={set('full_name')} required minLength={3} maxLength={200} /></label>
          <label>{t('Role')}
            <select value={form.person_role} onChange={set('person_role')}>
              {ROLES.map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
            </select>
          </label>
          <label>{t('Ownership %')}
            <input type="number" min="0" max="100" step="0.01" value={form.ownership_pct} onChange={set('ownership_pct')} required={form.person_role === 'BENEFICIAL_OWNER'} />
          </label>
          <label>{t('Nationality (ISO 3)')}<input value={form.nationality} onChange={set('nationality')} maxLength={3} placeholder="ESP" /></label>
          <label>{t('Birth year (optional)')}<input type="number" min="1900" max="2100" value={form.birth_year} onChange={set('birth_year')} /></label>
          <button type="submit" className="primary-action" disabled={busy}>{busy ? t('Saving…') : t('Add person')}</button>
        </form>
      )}
    </section>
  )
}

export default OnboardingPeople

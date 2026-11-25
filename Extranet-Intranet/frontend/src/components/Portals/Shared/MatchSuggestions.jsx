import { useEffect, useState } from 'react'
import api from '../../../api/client'
import { useT } from '../../../i18n'
import './MatchSuggestions.css'

/** Translated reason: the template and each value (sector, role, corridor names) in the user's language. */
function reasonText(t, reason) {
  if (!reason.template) return t(reason.text)
  const params = Object.fromEntries(Object.entries(reason.params || {}).map(([key, value]) => [key, Array.isArray(value) ? value.map((item) => t(item)).join(', ') : typeof value === 'string' ? t(value) : value]))
  return t(reason.template, params)
}

const CODES = { SECTOR: 'sector', COMMITTEE: 'committee', COMPLEMENT: 'complement', CORRIDOR: 'corridor' }

/** "People you should meet": matchmaking suggestions with the reasons behind each one. */
function MatchSuggestions({ url, title = 'People you should meet', onPick, pickLabel = 'Request meeting' }) {
  const t = useT()
  const [items, setItems] = useState(null)

  useEffect(() => {
    let alive = true
    api.get(url, { params: { limit: 5 } })
      .then((response) => { if (alive) setItems(response.data?.data || []) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [url])

  if (!items?.length) return null

  return (
    <section className="match-box" aria-label={t(title)}>
      <h4>✨ {t(title)}</h4>
      <ul>
        {items.map((item) => (
          <li key={item.user_id}>
            <div className="match-main">
              <strong>{item.name}</strong>
              {item.organisation && <small>{item.organisation}</small>}
              <span className="match-reasons">
                {item.reasons.map((reason) => <span key={reason.code} className={`match-chip match-${CODES[reason.code] || 'other'}`}>{reasonText(t, reason)}</span>)}
              </span>
            </div>
            <div className="match-side">
              <span className="match-score" title={t('Match score')}>{item.score}%</span>
              {item.video_bio_url && <a href={item.video_bio_url} target="_blank" rel="noreferrer">{t('Video')}</a>}
              {onPick && <button type="button" onClick={() => onPick(item)}>{t(pickLabel)}</button>}
            </div>
          </li>
        ))}
      </ul>
      <small className="match-note">{t('Suggested from shared sectors, committees, events, complementary roles and corridors.')}</small>
    </section>
  )
}

export default MatchSuggestions

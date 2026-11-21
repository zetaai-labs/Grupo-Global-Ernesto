import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../../../../api/client'
import { useT } from '../../../../../i18n'
import './RoleConsole.css'

const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(value || 0))

/** Role-specific console (Schema Document §3): Presidential, DevOps, HR or Delegate. */
function RoleConsole() {
  const t = useT()
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get('/dashboard/console').then((response) => setData(response.data?.data)).catch(() => setData(null))
  }, [])

  if (!data) return null

  return (
    <section className={`role-console role-console-${data.console.toLowerCase()}`} aria-label={t(data.title)}>
      <h2>{t(data.title)}</h2>
      <div className="role-console-grid">
        {data.cards.map((card) => {
          const body = (
            <>
              <span>{t(card.label)}</span>
              <strong>{card.format === 'eur' ? euro(card.value) : t(String(card.value))}</strong>
              <small>{t(card.note)}</small>
            </>
          )
          const className = `role-card ${card.alert ? 'is-alert' : ''}`
          return card.link
            ? <Link key={card.label} to={card.link} className={className}>{body}</Link>
            : <div key={card.label} className={className}>{body}</div>
        })}
      </div>
      {data.integrations && (
        <div className="role-integrations">
          <h3>{t('Systems & integrations')}</h3>
          <ul>
            {data.integrations.map((item) => (
              <li key={item.name}>
                <span className={`role-dot ${item.ok ? 'ok' : 'off'}`} aria-hidden="true" />
                <span>{t(item.name)}</span>
                <em>{t(item.status)}</em>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default RoleConsole

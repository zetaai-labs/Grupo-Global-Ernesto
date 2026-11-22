import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../../../../api/client'
import { useT } from '../../../../i18n'
import './Zylax.css'

const GROUP_ORDER = ['Talent & Human Capital', 'Finance & Supply Chain', 'Technology & Operations', 'Projects', 'Commercial', 'Distribution', 'External Support', 'Sector Suite']

function ZylaxHub() {
  const t = useT()
  const portal = useLocation().pathname.startsWith('/extranet') ? 'extranet' : 'intranet'
  const [modules, setModules] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/zylax/hub/modules')
      .then((response) => setModules(response.data?.data || []))
      .catch((failure) => setError(failure.response?.data?.message || 'Could not load ZYLAX.'))
  }, [])

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const visible = (modules || []).filter((module) => !needle || `${t(module.name)} ${t(module.description)}`.toLowerCase().includes(needle))
    return GROUP_ORDER.map((group) => [group, visible.filter((module) => module.group === group)]).filter(([, items]) => items.length)
  }, [modules, search, t])

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">ZYLAX</div>
          <h1>{t(portal === 'extranet' ? 'ZYLAX Extranet' : 'ZYLAX Suite')}</h1>
          <p>{t('Every business module in one place. You only see what your role can use.')}</p>
        </div>
      </div>
      {error && <div className="cloud-notice" role="alert">{t(error)}</div>}
      <div className="zx-toolbar"><input type="search" aria-label={t('Search modules')} placeholder={t('Search modules...')} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {modules && !modules.length && <p className="zx-empty">{t('No ZYLAX modules are enabled for this account.')}</p>}
      {groups.map(([group, items]) => (
        <div key={group} className="zh-group">
          <h2>{t(group)}</h2>
          <div className="zh-grid">
            {items.map((module) => (
              <Link key={module.key} className="zh-card" to={`/${portal}/zylax/${module.key}`}>
                <span className="zh-icon" aria-hidden="true">{module.icon}</span>
                <span><strong>{t(module.name)}</strong><small>{t(module.description)}</small></span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

export default ZylaxHub

import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../../../../api/client'
import { getUser } from '../../../../api/auth'
import { useT } from '../../../../i18n'
import { visibleNavigation, visibleScreens } from '../navigation'
import { openHelp } from '../help/helpEvents'
import { toggleFavourite, useUsage } from './usage'
import './Workspace.css'

const normal = (text) => String(text || '').toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "All features": every screen of the portal as a tile, with search, favourites, recently used and ZYLAX modules. */
function Workspace() {
  const t = useT()
  const portal = useLocation().pathname.startsWith('/extranet') ? 'extranet' : 'intranet'
  const role = getUser()?.role
  const { favourites, recent } = useUsage()
  const [search, setSearch] = useState('')
  const [modules, setModules] = useState([])

  const groups = useMemo(() => visibleNavigation(portal, role).map((group) => ({ ...group, items: group.items.filter((item) => !item.path.endsWith('/workspace')) })), [portal, role])
  const screens = useMemo(() => visibleScreens(portal, role).filter((item) => !item.path.endsWith('/workspace')), [portal, role])

  // ZYLAX modules this role can open, so they are searchable here too.
  useEffect(() => {
    if (!screens.some((item) => item.path.endsWith('/zylax'))) return undefined
    let alive = true
    api.get('/zylax/hub/modules')
      .then((response) => { if (alive) setModules(response.data?.data || []) })
      .catch(() => {})
    return () => { alive = false }
  }, [portal, screens])

  const needle = normal(search.trim())
  const matches = (item) => !needle || [item.name, item.description, item.group].some((text) => normal(t(text || '')).includes(needle) || normal(text).includes(needle))
  const zylaxTiles = modules.map((module) => ({ name: module.name, description: module.description, icon: module.icon || '◆', path: `/${portal}/zylax/${module.key}`, group: 'ZYLAX' }))
  const byPath = new Map([...screens, ...zylaxTiles].map((item) => [item.path, item]))
  const favouriteTiles = favourites.map((path) => byPath.get(path)).filter(Boolean)
  const recentTiles = recent.map((path) => byPath.get(path)).filter((item) => item && !favourites.includes(item.path)).slice(0, 4)
  const results = needle ? [...screens, ...zylaxTiles].filter(matches) : []

  const tile = (item) => (
    <div key={item.path} className="ws-tile">
      <Link to={item.path} className="ws-tile-link">
        <span className="ws-icon" aria-hidden="true">{item.icon}</span>
        <span className="ws-text">
          <strong>{t(item.name)}</strong>
          {item.description && <small>{t(item.description)}</small>}
        </span>
      </Link>
      <button
        type="button"
        className={`ws-star ${favourites.includes(item.path) ? 'on' : ''}`}
        aria-pressed={favourites.includes(item.path)}
        aria-label={t(favourites.includes(item.path) ? 'Remove from favourites' : 'Add to favourites')}
        title={t(favourites.includes(item.path) ? 'Remove from favourites' : 'Add to favourites')}
        onClick={() => toggleFavourite(item.path)}
      >{favourites.includes(item.path) ? '★' : '☆'}</button>
    </div>
  )

  return (
    <section className="feature-page ws-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('WORKSPACE')}</div>
          <h1>{t('All features')}</h1>
          <p>{t('Find any tool quickly. Star the ones you use most to keep them at the top.')}</p>
        </div>
      </div>

      <div className="ws-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search features, e.g. invoices, leave, chat…')} aria-label={t('Search features')} />
        <kbd>Ctrl K</kbd>
      </div>

      {needle ? (
        <div className="ws-group">
          <h2>{t('Results ({count})', { count: results.length })}</h2>
          {results.length ? <div className="ws-grid">{results.map(tile)}</div> : (
            <p className="ws-empty">{t('Nothing found.')} <button type="button" onClick={openHelp}>{t('Ask the support team')}</button></p>
          )}
        </div>
      ) : (
        <>
          {favouriteTiles.length > 0 && <div className="ws-group"><h2>★ {t('Favourites')}</h2><div className="ws-grid">{favouriteTiles.map(tile)}</div></div>}
          {recentTiles.length > 0 && <div className="ws-group"><h2>◷ {t('Recently used')}</h2><div className="ws-grid">{recentTiles.map(tile)}</div></div>}
          {groups.map((group) => (
            <div className="ws-group" key={group.label}>
              <h2>{t(group.label)}</h2>
              <div className="ws-grid">{group.items.map((item) => tile({ ...item, group: group.label }))}</div>
            </div>
          ))}
          {zylaxTiles.length > 0 && (
            <div className="ws-group">
              <h2>{t('ZYLAX modules ({count})', { count: zylaxTiles.length })}</h2>
              <div className="ws-grid ws-grid-compact">{zylaxTiles.map(tile)}</div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default Workspace

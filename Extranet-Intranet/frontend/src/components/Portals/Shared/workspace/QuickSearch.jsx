import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../../../api/client'
import { getUser } from '../../../../api/auth'
import { useT } from '../../../../i18n'
import { visibleScreens } from '../navigation'
import './QuickSearch.css'

const normal = (text) => String(text || '').toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')

/** Top-bar search: jump to any screen or ZYLAX module. Ctrl/⌘ K focuses it; arrows + Enter choose. */
function QuickSearch({ portal = 'intranet', placeholder }) {
  const t = useT()
  const navigate = useNavigate()
  const role = getUser()?.role
  const input = useRef(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [modules, setModules] = useState(null)

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const screens = useMemo(() => visibleScreens(portal, role), [portal, role])
  const loadModules = () => {
    if (modules !== null || !screens.some((item) => item.path.endsWith('/zylax'))) return
    setModules([])
    api.get('/zylax/hub/modules').then((response) => setModules(response.data?.data || [])).catch(() => {})
  }

  const results = useMemo(() => {
    const needle = normal(text.trim())
    const zylax = (modules || []).map((module) => ({ name: module.name, description: module.description, icon: module.icon || '◆', path: `/${portal}/zylax/${module.key}`, group: 'ZYLAX' }))
    const all = [...screens, ...zylax]
    if (!needle) return screens.slice(0, 8)
    return all
      .map((item) => {
        const name = normal(t(item.name))
        const raw = normal(item.name)
        const score = name.startsWith(needle) || raw.startsWith(needle) ? 3 : name.includes(needle) || raw.includes(needle) ? 2 : normal(t(item.description || '')).includes(needle) ? 1 : 0
        return { item, score }
      })
      .filter((entry) => entry.score)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((entry) => entry.item)
  }, [text, screens, modules, portal, t])

  const go = (item) => {
    if (!item) return
    navigate(item.path)
    setText('')
    setOpen(false)
    input.current?.blur()
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((index) => Math.min(results.length - 1, index + 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(0, index - 1)) }
    else if (event.key === 'Enter') { event.preventDefault(); go(results[active]) }
    else if (event.key === 'Escape') { setOpen(false); input.current?.blur() }
  }

  return (
    <div className="topbar-search qs" role="search">
      <span aria-hidden="true">⌕</span>
      <input
        ref={input}
        type="search"
        value={text}
        placeholder={placeholder}
        aria-label={t('Search features')}
        role="combobox"
        aria-expanded={open}
        aria-controls="qs-results"
        aria-activedescendant={open && results[active] ? `qs-${active}` : undefined}
        onFocus={() => { setOpen(true); loadModules() }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(event) => { setText(event.target.value); setActive(0); setOpen(true) }}
        onKeyDown={onKeyDown}
      />
      <kbd>{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
      {open && (
        <ul className="qs-results" id="qs-results" role="listbox">
          {!text.trim() && <li className="qs-hint" role="presentation">{t('Jump to')}</li>}
          {results.map((item, index) => (
            <li
              key={item.path}
              id={`qs-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'active' : ''}
              onMouseDown={(event) => { event.preventDefault(); go(item) }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="qs-icon" aria-hidden="true">{item.icon}</span>
              <span className="qs-text"><strong>{t(item.name)}</strong>{item.description && <small>{t(item.description)}</small>}</span>
              <span className="qs-group">{t(item.group)}</span>
            </li>
          ))}
          {text.trim() && !results.length && <li className="qs-hint" role="presentation">{t('Nothing found.')}</li>}
        </ul>
      )}
    </div>
  )
}

export default QuickSearch

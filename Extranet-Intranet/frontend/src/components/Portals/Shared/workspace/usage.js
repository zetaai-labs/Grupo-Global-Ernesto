import { useEffect, useState } from 'react'
import { getUser } from '../../../../api/auth'

/** Favourite and recently used screens, per person, kept on this device (a convenience, not shared data). */

const MAX_RECENT = 6
const key = (kind) => `gg_${kind}_${getUser()?.id || 'anon'}`
const listeners = new Set()

function read(kind) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key(kind)) || '[]')
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

function write(kind, list) {
  try { window.localStorage.setItem(key(kind), JSON.stringify(list)) } catch { /* ignore */ }
  listeners.forEach((listener) => listener())
}

export function toggleFavourite(path) {
  const list = read('favourites')
  write('favourites', list.includes(path) ? list.filter((item) => item !== path) : [...list, path])
}

export function recordVisit(path) {
  const list = read('recent').filter((item) => item !== path)
  write('recent', [path, ...list].slice(0, MAX_RECENT))
}

export function useUsage() {
  const [state, setState] = useState(() => ({ favourites: read('favourites'), recent: read('recent') }))
  useEffect(() => {
    const update = () => setState({ favourites: read('favourites'), recent: read('recent') })
    listeners.add(update)
    return () => listeners.delete(update)
  }, [])
  return state
}

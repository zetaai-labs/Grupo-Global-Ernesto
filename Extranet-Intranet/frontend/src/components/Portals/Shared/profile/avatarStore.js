import { useEffect, useState } from 'react'
import api from '../../../../api/client'
import { getUser } from '../../../../api/auth'

/**
 * Profile photos are served by the API with the sign-in token, so <img src> cannot load them directly:
 * they are fetched once as a blob and shared as an object URL. The version (photo change time) busts the cache.
 */
const urls = new Map()

export function avatarUrl(userId, version) {
  if (!userId || !version) return Promise.resolve(null)
  const key = `${userId}:${version}`
  if (!urls.has(key)) {
    urls.set(key, api.get(`/people/${userId}/avatar`, { params: { v: version }, responseType: 'blob' })
      .then((response) => URL.createObjectURL(response.data))
      .catch(() => null))
  }
  return urls.get(key)
}

/** The signed-in user, refreshed when their details change (for example a new photo). */
export function useCurrentUser() {
  const [user, setUser] = useState(getUser)
  useEffect(() => {
    const onChange = (event) => setUser(event.detail || getUser())
    window.addEventListener('gg:user', onChange)
    return () => window.removeEventListener('gg:user', onChange)
  }, [])
  return user
}

export function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?'
}

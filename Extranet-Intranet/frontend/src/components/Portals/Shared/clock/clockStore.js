import { useEffect, useState, useSyncExternalStore } from 'react'
import api from '../../../../api/client'

/**
 * One shared attendance clock for the whole intranet (top bar, Overview card, ZYLAX panel):
 * a single request, the same state everywhere, and a live timer computed from the server's time.
 */

const URL = '/zylax/hub/attendance/clock'
const REFRESH_MS = 60000

let state = { status: null, busy: false, error: '', offsetMs: 0, loadedAt: 0 }
const listeners = new Set()
let refreshTimer = null

function setState(patch) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export async function loadClock() {
  try {
    const response = await api.get(URL)
    const status = response.data?.data || null
    const offsetMs = status?.server_now ? new Date(status.server_now).getTime() - Date.now() : 0
    setState({ status, offsetMs, loadedAt: Date.now(), error: '' })
  } catch {
    setState({ status: state.status, error: state.status ? state.error : 'unavailable' })
  }
}

/** action: 'in' | 'out' | 'break_start' | 'break_end'. Returns the server result or throws. */
export async function clockAction(action) {
  if (state.busy) return null
  setState({ busy: true, error: '' })
  try {
    const response = await api.post(URL, { action })
    await loadClock()
    return response.data?.data
  } finally {
    setState({ busy: false })
  }
}

function subscribe(listener) {
  listeners.add(listener)
  if (listeners.size === 1) {
    if (!state.loadedAt || Date.now() - state.loadedAt > 5000) loadClock()
    refreshTimer = setInterval(loadClock, REFRESH_MS)
    window.addEventListener('focus', loadClock)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearInterval(refreshTimer)
      window.removeEventListener('focus', loadClock)
    }
  }
}

export function useClock() {
  return useSyncExternalStore(subscribe, () => state)
}

/** Re-renders every second while `active`, so timers tick without asking the server. */
export function useTick(active) {
  const [, setNow] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
}

/** Live seconds: what the server reported plus the time since it was loaded (paused on a break). */
export function liveSeconds(clock) {
  const status = clock.status
  if (!status) return { session: 0, today: 0, week: 0, breakSeconds: 0 }
  const open = status.open
  const elapsed = open && clock.loadedAt ? Math.max(0, (Date.now() - clock.loadedAt) / 1000) : 0
  const working = open && !open.on_break ? elapsed : 0
  return {
    session: Math.floor((open?.worked_seconds || 0) + working),
    today: Math.floor((status.today_seconds || 0) + working),
    week: Math.floor((status.week_seconds || 0) + working),
    breakSeconds: Math.floor((open?.break_seconds || 0) + (open?.on_break ? elapsed : 0)),
  }
}

/** 0:01:05 style stopwatch. */
export function stopwatch(seconds) {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** "0 h 01 min" style total: readable even after one minute of work. */
export function hoursMinutes(seconds) {
  const total = Math.max(0, Math.floor(seconds / 60))
  return { h: Math.floor(total / 60), m: String(total % 60).padStart(2, '0') }
}

/** Translated duration: "45 s" under a minute, otherwise "1 h 05 min". */
export function duration(t, seconds) {
  const value = Math.max(0, Math.floor(seconds || 0))
  return value < 60 ? t('{s} s', { s: value }) : t('{h} h {m} min', hoursMinutes(value))
}

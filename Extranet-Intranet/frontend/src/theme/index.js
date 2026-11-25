import { useSyncExternalStore } from 'react'
import './dark.css'

/** Light / dark theme. Starts from the saved choice or the device setting, and is remembered per browser. */

const STORAGE_KEY = 'gg_theme'
const listeners = new Set()

function initialTheme() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage unavailable: fall back to the device setting.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let theme = typeof window === 'undefined' ? 'light' : initialTheme()
if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme

export const getTheme = () => theme

export function setTheme(next) {
  if (next !== 'light' && next !== 'dark') return
  theme = next
  document.documentElement.dataset.theme = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Not persisted; still applies for this session.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => 'light')
}

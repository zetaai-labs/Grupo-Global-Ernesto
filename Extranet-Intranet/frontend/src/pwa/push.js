import api from '../api/client'

/**
 * Phone and desktop alerts (Web Push). The service worker (public/sw.js) shows them, also when the app
 * is closed. On iPhone/iPad they work only after "Add to Home Screen" (iOS 16.4 or later).
 */

export const pushSupported = () => typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

function keyBytes(base64) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

async function registration() {
  if (!pushSupported()) return null
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  // The app registers the worker in production builds only (see main.jsx).
  return import.meta.env.PROD ? navigator.serviceWorker.register('/sw.js') : null
}

async function currentSubscription() {
  const reg = await registration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** { supported, available, permission, subscribed, needsInstall } for this device. */
export async function alertState() {
  if (!pushSupported()) return { supported: false, available: false, permission: 'unsupported', subscribed: false, needsInstall: isIos() && !isStandalone() }
  let available
  try {
    available = Boolean((await api.get('/push')).data?.data?.enabled)
  } catch {
    available = false
  }
  const reg = await registration().catch(() => null)
  const subscription = reg ? await reg.pushManager.getSubscription() : null
  return { supported: Boolean(reg), available, permission: Notification.permission, subscribed: Boolean(subscription), needsInstall: false }
}

/** Asks permission (must follow a click) and saves this device. Returns the new state's permission. */
export async function enableAlerts() {
  const config = (await api.get('/push')).data?.data
  if (!config?.enabled || !config.public_key) throw new Error('not-configured')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission
  const reg = await registration()
  if (!reg) throw new Error('no-worker')
  await navigator.serviceWorker.ready
  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    // Some browsers never answer when their push service is unreachable: give up after 15 seconds.
    const timeout = new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), 15000) })
    subscription = await Promise.race([reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.public_key) }), timeout])
  }
  await api.post('/push/subscriptions', { subscription: subscription.toJSON() })
  return 'granted'
}

export async function disableAlerts() {
  const subscription = await currentSubscription().catch(() => null)
  if (!subscription) return
  await api.delete('/push/subscriptions', { data: { endpoint: subscription.endpoint } }).catch(() => {})
  await subscription.unsubscribe().catch(() => {})
}

/** At sign-in: re-saves this device's subscription, which may belong to whoever used it before. */
export async function syncAlerts() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const subscription = await currentSubscription()
    if (subscription) await api.post('/push/subscriptions', { subscription: subscription.toJSON() })
  } catch {
    // Best effort.
  }
}

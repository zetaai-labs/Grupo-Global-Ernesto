import { useEffect, useState } from 'react'
import { getSharedSocket } from '../../../api/socket'

const PING_INTERVAL_MS = 15000
const PING_TIMEOUT_MS = 5000

/**
 * Live Sync Status: pings the backend over the shared socket.
 * Returns { state: 'connecting' | 'online' | 'offline', latencyMs, lastSyncedAt }.
 */
export function useSyncStatus() {
  const [status, setStatus] = useState({ state: 'connecting', latencyMs: null, lastSyncedAt: null })

  useEffect(() => {
    const socket = getSharedSocket()
    if (!socket) return undefined

    const ping = () => {
      if (!socket.connected) return
      const started = performance.now()
      socket.timeout(PING_TIMEOUT_MS).emit('sync:ping', (error, reply) => {
        if (error || !reply?.ok) {
          setStatus((current) => ({ ...current, state: 'offline' }))
          return
        }
        setStatus({
          state: 'online',
          latencyMs: Math.round(performance.now() - started),
          lastSyncedAt: new Date(),
        })
      })
    }
    const goOffline = () => setStatus((current) => ({ ...current, state: 'offline' }))

    socket.on('connect', ping)
    socket.on('disconnect', goOffline)
    socket.on('connect_error', goOffline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', ping)
    if (socket.connected) ping()
    const timer = setInterval(ping, PING_INTERVAL_MS)

    return () => {
      clearInterval(timer)
      socket.off('connect', ping)
      socket.off('disconnect', goOffline)
      socket.off('connect_error', goOffline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', ping)
    }
  }, [])

  return status
}

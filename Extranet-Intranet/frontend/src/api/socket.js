import { io } from 'socket.io-client'
import { getToken } from './auth'

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:5000')

let socket = null
let socketToken = null

/**
 * One shared Socket.IO connection per browser tab for app-wide live features
 * (sync status, notifications). Reconnects automatically if the user changes.
 */
export function getSharedSocket() {
  const token = getToken()
  if (!token) return null
  if (socket && socketToken === token) return socket

  socket?.disconnect()
  socketToken = token
  socket = io(SOCKET_URL, { auth: { token } })
  return socket
}

export function closeSharedSocket() {
  socket?.disconnect()
  socket = null
  socketToken = null
}

import jwt from 'jsonwebtoken'

/**
 * LiveKit-compatible SFU (Technical Spec §2.3). Active only when LIVEKIT_URL,
 * LIVEKIT_API_KEY and LIVEKIT_API_SECRET are set; otherwise video stays on WebRTC mesh.
 */

export function livekitConfigured() {
  const url = process.env.LIVEKIT_URL || ''
  const secure = url.startsWith('wss://')
  const localDev = process.env.NODE_ENV !== 'production' && /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)
  return Boolean((secure || localDev) && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
}

/** Issues a short-lived access token valid for exactly one room. */
export function issueRoomToken({ room, identity, name }) {
  const ttl = Math.min(Math.max(Number(process.env.LIVEKIT_TOKEN_TTL_SECONDS) || 3600, 60), 86400)
  const roomName = `${process.env.LIVEKIT_ROOM_PREFIX || ''}${room}`
  const token = jwt.sign(
    {
      name,
      video: { room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    },
    process.env.LIVEKIT_API_SECRET,
    {
      algorithm: 'HS256',
      issuer: process.env.LIVEKIT_API_KEY,
      subject: String(identity),
      notBefore: 0,
      expiresIn: ttl,
    },
  )
  return { url: process.env.LIVEKIT_URL, token, room: roomName, expires_in: ttl }
}

import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { query } from '../config/database.js'
import { setIo } from './io.js'
import { canJoinRoom } from '../controllers/calendar.controller.js'
import { originSecretValid } from '../middleware/cloudflare.js'
import { openMessage } from '../services/chatCrypto.service.js'

const MAX_PARTICIPANTS = 8

async function isMember(conversationId, userId) {
  const { rowCount } = await query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  )
  return rowCount > 0
}

export function registerSockets(io) {
  setIo(io)

  // Reject sockets without a valid session JWT (purpose-scoped tokens such as MFA challenges are refused).
  io.use(async (socket, next) => {
    try {
      if (!originSecretValid(socket.handshake.headers['x-origin-secret'])) return next(new Error('Unauthorized'))
      const claims = jwt.verify(socket.handshake.auth?.token, config.jwtSecret)
      if (claims.purpose || claims.mfa_setup) return next(new Error("Unauthorized"))

      const { rows } = await query(
        `SELECT u.id, u.name, u.status, u.session_version FROM users u WHERE u.id = $1`,
        [claims.sub],
      )
      if (!rows[0] || rows[0].status !== 'active' || (claims.sv ?? 0) !== rows[0].session_version) return next(new Error('Unauthorized'))

      socket.user = { ...claims, name: rows[0].name }
      socket.data.name = rows[0].name
      return next()
    } catch {
      return next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    // Personal room: notifications and invitations are pushed here.
    socket.join(`user:${socket.user.sub}`)

    // Live Sync Status: clients ping, server answers with its clock.
    socket.on('sync:ping', (ack) => {
      if (typeof ack === 'function') ack({ ok: true, serverTime: new Date().toISOString() })
    })

    socket.on('chat:join', async (conversationId) => {
      try {
        if (await isMember(conversationId, socket.user.sub)) {
          socket.join(`conversation:${conversationId}`)
        }
      } catch {
        // Ignore malformed ids.
      }
    })

    // Messages are persisted through the REST API; the socket only relays the stored row,
    // so clients cannot spoof sender names or inject messages into other conversations.
    socket.on('chat:message', async (payload) => {
      try {
        const { rows } = await query(
          `SELECT id, conversation_id, user_id, sender_name, body, created_at
           FROM messages WHERE id = $1 AND user_id = $2`,
          [payload?.id, socket.user.sub],
        )
        const message = rows[0]
        if (!message) return
        if (!(await isMember(message.conversation_id, socket.user.sub))) return
        io.to(`conversation:${message.conversation_id}`).emit('chat:message', { ...message, body: openMessage(message.body) })
      } catch {
        // Ignore malformed payloads.
      }
    })

    // ----- Video meetings (WebRTC mesh; the server only relays signaling) -----
    const leaveVideo = () => {
      const room = socket.data.videoRoom
      if (!room) return
      socket.to(`video:${room}`).emit('video:peer-left', { id: socket.id })
      socket.leave(`video:${room}`)
      socket.data.videoRoom = null
    }

    socket.on('video:join', async (room, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      try {
        const name = String(room || '').slice(0, 64)
        if (!name || !(await canJoinRoom(socket.user, name))) {
          return reply({ ok: false, message: 'You are not invited to this meeting.' })
        }
        const existing = await io.in(`video:${name}`).fetchSockets()
        if (existing.length >= MAX_PARTICIPANTS) {
          return reply({ ok: false, message: `This meeting is full (${MAX_PARTICIPANTS} participants).` })
        }
        leaveVideo()
        socket.data.videoRoom = name
        socket.join(`video:${name}`)
        socket.to(`video:${name}`).emit('video:peer-joined', { id: socket.id, name: socket.user.name })
        return reply({ ok: true, peers: existing.map((peer) => ({ id: peer.id, name: peer.data?.name || 'Participant' })) })
      } catch {
        return reply({ ok: false, message: 'Could not join the meeting.' })
      }
    })

    // Relay offer/answer/ICE only between participants of the same room.
    socket.on('video:signal', ({ to, data } = {}) => {
      const room = socket.data.videoRoom
      const target = to && io.sockets.sockets.get(to)
      if (!room || !target || !target.rooms.has(`video:${room}`)) return
      target.emit('video:signal', { from: socket.id, name: socket.user.name, data })
    })

    socket.on('video:leave', leaveVideo)
    socket.on('disconnect', leaveVideo)
  })
}

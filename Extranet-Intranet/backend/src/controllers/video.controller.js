import { z } from 'zod'
import { canJoinRoom } from './calendar.controller.js'
import { writeAudit } from '../services/audit.js'
import { livekitConfigured, issueRoomToken } from '../integrations/video/livekit.js'

const roomSchema = z.object({ room: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) })

/** Returns an SFU session when configured, or tells the client to use WebRTC mesh. */
export async function createVideoSession(req, res) {
  const parsed = roomSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ message: 'Invalid meeting room.' })
  const { room } = parsed.data

  if (!(await canJoinRoom(req.user, room))) {
    return res.status(403).json({ message: 'You are not invited to this meeting.' })
  }
  if (!livekitConfigured()) return res.json({ data: { mode: 'mesh' } })

  const session = issueRoomToken({ room, identity: req.user.uuid, name: req.user.name })
  await writeAudit(req.user.sub, 'VIDEO_SFU_TOKEN_ISSUED', 'video_rooms', room)
  return res.json({ data: { mode: 'sfu', ...session } })
}

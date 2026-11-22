import { Router } from 'express'
import { createVideoSession } from '../controllers/video.controller.js'

// Mounted behind authenticate. Room access is checked with canJoinRoom.
const router = Router()
router.post('/session', createVideoSession)

export default router

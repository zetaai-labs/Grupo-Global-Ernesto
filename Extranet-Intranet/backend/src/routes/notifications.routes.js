import { Router } from 'express'
import { listNotifications, markRead, markAllRead } from '../controllers/notifications.controller.js'

const router = Router()

// Mounted behind authenticate; every user sees only their own notifications.
router.get('/', listNotifications)
router.post('/read-all', markAllRead)
router.post('/:id/read', markRead)

export default router

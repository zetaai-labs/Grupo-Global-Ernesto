import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import {
  askAssistant, contactTeam, assistantOverview, createEntry, updateEntry, deleteEntry, markContactAnswered,
} from '../controllers/assistant.controller.js'

const limited = (windowMinutes, limit, message) => rateLimit({
  windowMs: windowMinutes * 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { message },
})

/** Public (no sign-in): the website visitor's chat and "Talk to the team". */
export const publicAssistantRoutes = Router()
publicAssistantRoutes.post('/ask', limited(10, 30, 'Too many questions. Wait a few minutes and try again.'), askAssistant)
publicAssistantRoutes.post('/contact', limited(60, 5, 'Too many requests. Please try again later.'), contactTeam)

/** Staff (mounted behind authenticate): knowledge, unanswered questions and contact requests. */
const router = Router()
router.get('/', assistantOverview)
router.post('/knowledge', createEntry)
router.patch('/knowledge/:id', updateEntry)
router.delete('/knowledge/:id', deleteEntry)
router.post('/contacts/:id/answered', markContactAnswered)

export default router

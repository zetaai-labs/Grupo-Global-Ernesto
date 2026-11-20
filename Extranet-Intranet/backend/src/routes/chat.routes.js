import { Router } from 'express'
import { listConversations, listMessages, createMessage } from '../controllers/chat.controller.js'

const router = Router()

router.get('/conversations', listConversations)
router.get('/conversations/:id/messages', listMessages)
router.post('/conversations/:id/messages', createMessage)

export default router

import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { listConversations, listMessages, createMessage } from '../controllers/chat.controller.js'
import { myKey, privateContacts, publicKeys, saveMyKey, startPrivate } from '../controllers/e2ee.controller.js'

const router = Router()

router.get('/conversations', listConversations)
router.get('/conversations/:id/messages', listMessages)
router.post('/conversations/:id/messages', createMessage)

// End-to-end encrypted private chat.
router.get('/e2ee/me', myKey)
router.post('/e2ee/me', rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many attempts. Try again later.' } }), saveMyKey)
router.get('/e2ee/keys', publicKeys)
router.get('/private/contacts', privateContacts)
router.post('/private', startPrivate)

export default router

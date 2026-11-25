import { Router } from 'express'
import { pushConfig, subscribe, testPush, unsubscribe } from '../controllers/push.controller.js'

// Mounted behind authenticate (intranet and extranet accounts).
const router = Router()
router.get('/', pushConfig)
router.post('/subscriptions', subscribe)
router.delete('/subscriptions', unsubscribe)
router.post('/test', testPush)

export default router

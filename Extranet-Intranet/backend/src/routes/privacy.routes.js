import { Router } from 'express'
import { myPrivacy, exportZip, createRequest, listRequests, decideRequest } from '../controllers/privacy.controller.js'

// Mounted behind authenticate. Officer-only checks are enforced in the controller.
const router = Router()
router.get('/me', myPrivacy)
router.get('/export', exportZip)
router.post('/requests', createRequest)
router.get('/requests', listRequests)
router.post('/requests/:id/decide', decideRequest)

export default router

import { Router } from 'express'
import { myCompliance, acknowledgeCode, register, issueSanction, clearSanction } from '../controllers/governance.controller.js'

// Mounted behind authenticate. Officer-only checks are enforced in the controller.
const router = Router()
router.get('/me', myCompliance)
router.post('/acknowledge', acknowledgeCode)
router.get('/register', register)
router.post('/sanctions', issueSanction)
router.post('/sanctions/:id/clear', clearSanction)

export default router

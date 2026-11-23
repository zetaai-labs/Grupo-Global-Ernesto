import { Router } from 'express'
import { auditIntegrity, createAuditAnchor, listAuditLogs } from '../controllers/auditLogs.controller.js'

const router = Router()

router.get('/', listAuditLogs)
router.get('/integrity', auditIntegrity)
router.post('/anchors', createAuditAnchor)

export default router

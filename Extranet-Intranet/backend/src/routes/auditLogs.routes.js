import { Router } from 'express'
import { auditIntegrity, auditSummary, createAuditAnchor, exportAuditLogs, listAuditLogs } from '../controllers/auditLogs.controller.js'

const router = Router()

router.get('/', listAuditLogs)
router.get('/summary', auditSummary)
router.get('/export.csv', exportAuditLogs)
router.get('/integrity', auditIntegrity)
router.post('/anchors', createAuditAnchor)

export default router

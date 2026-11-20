import { Router } from 'express'
import { listAuditLogs } from '../controllers/auditLogs.controller.js'

const router = Router()

router.get('/', listAuditLogs)

export default router

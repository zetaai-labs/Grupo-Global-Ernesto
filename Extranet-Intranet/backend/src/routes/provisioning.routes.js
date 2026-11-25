import { Router } from 'express'
import * as provisioning from '../controllers/provisioning.controller.js'

// Mounted behind authenticate + requireRole(...PROVISIONING_ROLES).
const router = Router()
router.get('/status', provisioning.status)
router.get('/staff', provisioning.listStaff)
router.get('/jobs', provisioning.listJobs)
router.post('/users/:id', provisioning.provisionUser)

export default router

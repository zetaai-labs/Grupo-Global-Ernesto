import { Router } from 'express'
import { listBackups, createBackupNow, restore } from '../controllers/backups.controller.js'

const router = Router()

router.get('/', listBackups)
router.post('/', createBackupNow)
router.post('/:id/restore', restore)

export default router

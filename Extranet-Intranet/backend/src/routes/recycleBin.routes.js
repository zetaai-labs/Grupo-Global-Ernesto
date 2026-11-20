import { Router } from 'express'
import { listDeleted, restoreItem, purgeItem } from '../controllers/recycleBin.controller.js'

const router = Router()

router.get('/', listDeleted)
router.post('/:type/:id/restore', restoreItem)
router.delete('/:type/:id', purgeItem)

export default router

import { Router } from 'express'
import { downloadByToken } from '../controllers/metaLinks.controller.js'

const router = Router()

router.get('/:token', downloadByToken)

export default router

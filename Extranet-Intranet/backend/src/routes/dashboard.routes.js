import { Router } from 'express'
import { getDashboard, getConsole } from '../controllers/dashboard.controller.js'

const router = Router()

router.get('/', getDashboard)
router.get('/console', getConsole)

export default router

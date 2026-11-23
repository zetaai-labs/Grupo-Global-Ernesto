import { Router } from 'express'
import { integrationReport } from '../services/integrationStatus.service.js'

// Mounted behind authenticate + requireSystemAdmin. Read-only; never returns setting values.
const router = Router()

router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'no-store')
  return res.json({ data: await integrationReport() })
})

export default router

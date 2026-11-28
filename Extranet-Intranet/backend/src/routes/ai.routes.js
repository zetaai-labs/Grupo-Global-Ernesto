import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { aiStatus, summarizeRecord, smartSearch, crmNextStep, summarizeFile, translate } from '../controllers/ai.controller.js'

// Mounted behind authenticate. Each handler checks staff role, the daily limit and record access.
const router = Router()
// Every ZYLAX page asks whether AI is available: that check is free and must not use up the AI limit.
router.get('/status', aiStatus)
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `ai-${req.user?.sub ?? 'anon'}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many AI requests. Wait a minute and try again.' },
}))
router.post('/translate', translate)
router.post('/zylax/:module/:entity/search', smartSearch)
router.post('/zylax/:module/:entity/:id/summary', summarizeRecord)
router.post('/crm/:id/next-step', crmNextStep)
router.post('/files/:id/summary', summarizeFile)

export default router

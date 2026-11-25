import { Router } from 'express'
import { upload, persistUpload } from '../middleware/upload.js'
import * as engine from './engine.controller.js'
import * as attendanceTeam from './attendanceTeam.controller.js'
import * as special from './special.controller.js'
import * as documents from './documents.controller.js'
import * as reports from './reports.controller.js'
import * as fleet from './fleet.controller.js'
import * as terminal from './terminal.controller.js'
import * as onboarding from './onboarding.controller.js'
import * as hybrid from './eventsHybrid.controller.js'
import { matchSuggestions } from '../controllers/aiEngine.controller.js'

// Mounted behind authenticate. Every handler enforces its own role, company and record rules.
const router = Router()

router.get('/modules', engine.listModules)
router.get('/lookups', engine.lookups)
router.get('/catalog', special.catalog)
router.get('/attendance/clock', special.clockStatus)
router.post('/attendance/clock', special.clock)
router.get('/attendance/team', attendanceTeam.teamNow)
router.get('/attendance/report', attendanceTeam.monthReport)
router.post('/attendance/entries/:id/correct', attendanceTeam.correctEntry)
router.get('/safety/roster/:id', special.musterRoster)
router.post('/fleet/vehicles/:id/position', fleet.reportPosition)
router.get('/fleet/vehicles/:id/positions', fleet.listPositions)
router.get('/onboarding/accounts', onboarding.accountOptions)
router.post('/onboarding/plans/:id/accounts', onboarding.createPlanAccounts)
router.get('/events/events/:id/join', hybrid.joinEvent)
router.get('/events/events/:id/b2b/participants', hybrid.participants)
router.get('/events/events/:id/b2b/suggestions', matchSuggestions)
router.get('/events/events/:id/b2b/meetings', hybrid.myMeetings)
router.post('/events/events/:id/b2b/meetings', hybrid.requestMeeting)
router.post('/events/events/:id/b2b/meetings/:meetingId/respond', hybrid.respondMeeting)
router.post('/events/events/:id/b2b/meetings/:meetingId/cancel', hybrid.cancelMeeting)
router.post('/pos/sales', special.posSale)
router.get('/pos/terminal/readers', terminal.listReaders)
router.post('/pos/invoices/:id/terminal', terminal.startPayment)
router.get('/pos/invoices/:id/terminal', terminal.paymentStatus)
router.post('/pos/invoices/:id/terminal/cancel', terminal.cancelPayment)
router.get('/pos/invoices', special.listInvoices)
router.get('/pos/my-invoices', special.myInvoices)
router.get('/pos/my-invoices/:id/pdf', documents.portalDownloadInvoice)
router.get('/pos/invoices/:id/pdf', documents.downloadInvoice)
router.post('/pos/invoices/:id/email', documents.emailInvoice)
router.post('/pos/orders/:orderId/invoice', special.invoiceOrder)
router.post('/pos/invoices/:id/pay', special.payInvoice)
router.post('/pos/invoices/:id/refund', special.refundInvoice)
router.post('/pos/invoices/:id/cancel', special.cancelInvoice)

router.get('/:module/:entity/export', reports.exportRecords)
router.get('/:module/:entity/report', reports.reportRecords)
router.get('/:module/:entity', engine.listRecords)
router.post('/:module/:entity', engine.createRecord)
router.get('/:module/:entity/:id', engine.getRecord)
router.patch('/:module/:entity/:id', engine.updateRecord)
router.post('/:module/:entity/:id/transition', engine.transitionRecord)
router.post('/:module/:entity/:id/actions/:action', engine.runAction)
router.post('/:module/:entity/:id/comments', engine.addComment)
router.post('/:module/:entity/:id/files', engine.preflightFile, upload.single('file'), persistUpload, engine.addFile)
router.get('/:module/:entity/:id/files/:fileId', engine.downloadRecordFile)

export default router

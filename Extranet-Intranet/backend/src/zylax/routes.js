import { Router } from 'express'
import { upload, persistUpload } from '../middleware/upload.js'
import * as engine from './engine.controller.js'
import * as special from './special.controller.js'

// Mounted behind authenticate. Every handler enforces its own role, company and record rules.
const router = Router()

router.get('/modules', engine.listModules)
router.get('/lookups', engine.lookups)
router.get('/catalog', special.catalog)
router.get('/attendance/clock', special.clockStatus)
router.post('/attendance/clock', special.clock)
router.get('/safety/roster/:id', special.musterRoster)
router.post('/pos/sales', special.posSale)
router.get('/pos/invoices', special.listInvoices)
router.get('/pos/my-invoices', special.myInvoices)
router.post('/pos/orders/:orderId/invoice', special.invoiceOrder)
router.post('/pos/invoices/:id/pay', special.payInvoice)
router.post('/pos/invoices/:id/refund', special.refundInvoice)

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

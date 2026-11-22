import { Router } from 'express'
import { COMMERCIAL_SELL_ROLES } from '../config/roles.js'
import { requireRole } from '../middleware/authorize.js'
import * as c from '../controllers/commercial.controller.js'

// Mounted behind authenticate + COMMERCIAL_READ_ROLES. Finance has read-only access.
const router = Router()
const sell = requireRole(...COMMERCIAL_SELL_ROLES)
router.param('id', c.validateId)

router.get('/summary', c.getSummary)
router.get('/customers', c.listCustomers)
router.get('/products', c.listProducts)
router.post('/products', sell, c.createProduct)
router.patch('/products/:id', sell, c.updateProduct)
router.get('/contacts', c.listContacts)
router.post('/contacts', sell, c.createContact)
router.patch('/contacts/:id', sell, c.updateContact)
router.get('/distributors', c.listDistributors)
router.post('/distributors', sell, c.createDistributor)
router.patch('/distributors/:id', sell, c.updateDistributor)
router.get('/quotes', c.listQuotes)
router.post('/quotes', sell, c.createQuote)
router.get('/quotes/:id', c.getQuote)
router.put('/quotes/:id', sell, c.updateQuote)
router.post('/quotes/:id/send', sell, c.sendQuote)
router.post('/quotes/:id/accept', sell, c.acceptQuote)
router.post('/quotes/:id/reject', sell, c.rejectQuote)
router.get('/orders', c.listOrders)
router.get('/orders/:id', c.getOrder)
router.patch('/orders/:id/status', sell, c.updateOrderStatus)

/** Mounted behind authenticate + COMMERCIAL_CUSTOMER_ROLES. */
export const commercialPortalRoutes = Router()
commercialPortalRoutes.param('id', c.validateId)
commercialPortalRoutes.get('/quotes', c.portalListQuotes)
commercialPortalRoutes.get('/quotes/:id', c.portalGetQuote)
commercialPortalRoutes.post('/quotes/:id/accept', c.portalAcceptQuote)
commercialPortalRoutes.post('/quotes/:id/reject', c.portalRejectQuote)
commercialPortalRoutes.get('/orders', c.portalListOrders)
commercialPortalRoutes.get('/orders/:id', c.portalGetOrder)

export default router

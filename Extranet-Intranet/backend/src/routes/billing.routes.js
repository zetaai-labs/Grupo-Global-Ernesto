import { Router } from 'express'
import * as billing from '../controllers/billing.controller.js'
import { listRisk, runRisk } from '../controllers/aiEngine.controller.js'

// Mounted behind authenticate. Staff endpoints check BILLING_ROLES; customer endpoints check the company.
const router = Router()

router.get('/providers', billing.providers)
router.get('/metrics', billing.metrics)
router.get('/plans', billing.listPlans)
router.post('/plans', billing.createPlan)
router.patch('/plans/:id', billing.updatePlan)
router.get('/subscriptions', billing.listSubscriptions)
router.post('/subscriptions', billing.createSubscription)
router.post('/subscriptions/:id/cancel', billing.cancelSubscription)
router.get('/payments', billing.listPayments)
router.post('/run', billing.runCycle)
router.get('/risk', listRisk)
router.post('/risk/run', runRisk)

router.get('/my', billing.myBilling)
router.post('/invoices/:id/checkout', billing.startCheckout)
router.post('/paypal/capture', billing.capturePaypal)

/** Public, signature-checked provider callbacks. */
export const paymentWebhookRoutes = Router()
paymentWebhookRoutes.post('/stripe', billing.stripeWebhook)
paymentWebhookRoutes.post('/paypal', billing.paypalWebhook)

export default router

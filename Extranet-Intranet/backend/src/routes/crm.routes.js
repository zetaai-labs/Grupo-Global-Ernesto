import { Router } from 'express'
import {
  listRelationships,
  getRelationship,
  createRelationship,
  updateRelationship,
  addActivity,
  listManagers,
  receiveLeadWebhook,
} from '../controllers/crm.controller.js'

// Mounted behind authenticate + requireIntranet. Record-level visibility is enforced in the controller.
const router = Router()
router.get('/', listRelationships)
router.get('/managers', listManagers)
router.post('/', createRelationship)
router.get('/:id', getRelationship)
router.patch('/:id', updateRelationship)
router.post('/:id/activities', addActivity)

/** Public, HMAC-signed webhook from the corporate website (no JWT). */
export const crmWebhookRoutes = Router()
crmWebhookRoutes.post('/crm-lead', receiveLeadWebhook)

export default router

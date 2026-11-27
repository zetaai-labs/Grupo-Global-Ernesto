import { Router } from 'express'
import * as cc from '../controllers/callCenter.controller.js'

// Mounted behind authenticate + requireIntranet. Agent endpoints check the agent list; the rest check supervisors.
const router = Router()

router.get('/me', cc.myDesk)
router.post('/me/status', cc.setMyStatus)
router.post('/next', cc.nextContact)
router.post('/inbound', cc.logInbound)
router.get('/contacts/:id', cc.openContact)
router.post('/contacts/:id/calls', cc.recordCall)
router.post('/contacts/:id/release', cc.releaseContact)

router.get('/live', cc.liveBoard)
router.get('/campaigns', cc.listCampaigns)
router.post('/campaigns', cc.createCampaign)
router.patch('/campaigns/:id', cc.updateCampaign)
router.post('/campaigns/:id/contacts', cc.importContacts)
router.get('/agents', cc.listAgents)
router.post('/agents', cc.addAgent)
router.patch('/agents/:userId', cc.updateAgent)

export default router

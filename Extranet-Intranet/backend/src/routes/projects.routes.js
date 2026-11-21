import { Router } from 'express'
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  addMember,
  removeMember,
  addPartner,
  removePartner,
  addMilestone,
  updateMilestone,
  sharedProjects,
} from '../controllers/projects.controller.js'
import { requireIntranet } from '../middleware/authorize.js'

// Mounted behind authenticate. Staff routes are intranet-only; /shared serves the Extranet.
const router = Router()
router.get('/shared', sharedProjects)
router.get('/', requireIntranet, listProjects)
router.post('/', requireIntranet, createProject)
router.get('/:id', requireIntranet, getProject)
router.patch('/:id', requireIntranet, updateProject)
router.post('/:id/members', requireIntranet, addMember)
router.delete('/:id/members/:userId', requireIntranet, removeMember)
router.post('/:id/partners', requireIntranet, addPartner)
router.delete('/:id/partners/:orgId', requireIntranet, removePartner)
router.post('/:id/milestones', requireIntranet, addMilestone)
router.patch('/:id/milestones/:milestoneId', requireIntranet, updateMilestone)

export default router

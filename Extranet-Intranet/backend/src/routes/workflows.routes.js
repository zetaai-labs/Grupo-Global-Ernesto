import { Router } from 'express'
import { listWorkflows, listTemplates, listPeople, createWorkflow, updateWorkflow } from '../controllers/workflows.controller.js'

const router = Router()

router.get('/', listWorkflows)
router.get('/templates', listTemplates)
router.get('/people', listPeople)
router.post('/', createWorkflow)
router.patch('/:id', updateWorkflow)

export default router

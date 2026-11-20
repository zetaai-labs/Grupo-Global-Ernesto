import { Router } from 'express'
import { listEmails, getEmail, sendEmail, deleteEmail } from '../controllers/emails.controller.js'

const router = Router()

router.get('/', listEmails)
router.post('/', sendEmail)
router.get('/:id', getEmail)
router.delete('/:id', deleteEmail)

export default router

import { Router } from 'express'
import {
  listAnnouncements,
  createAnnouncement,
  listLinkedFolders,
  addLinkedFolder,
  removeLinkedFolder,
} from '../controllers/content.controller.js'
import { requireAdmin } from '../middleware/authorize.js'
import { listEvents, listInvitees, createEvent, respondToEvent, deleteEvent } from '../controllers/calendar.controller.js'
import { upload, persistUpload } from '../middleware/upload.js'
import { listMySubmissions, createMySubmission } from '../controllers/content.controller.js'

const router = Router()

router.get('/my-submissions', listMySubmissions)
router.post('/my-submissions', upload.single('file'), persistUpload, createMySubmission)

router.get('/announcements', listAnnouncements)
router.post('/announcements', requireAdmin, createAnnouncement)

router.get('/linked-folders', listLinkedFolders)
router.post('/linked-folders', addLinkedFolder)
router.delete('/linked-folders/:id', removeLinkedFolder)

router.get('/calendar/events', listEvents)
router.get('/calendar/invitees', listInvitees)
router.post('/calendar/events', createEvent)
router.post('/calendar/events/:id/respond', respondToEvent)
router.delete('/calendar/events/:id', deleteEvent)

export default router

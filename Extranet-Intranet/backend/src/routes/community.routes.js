import { Router } from 'express'
import {
  directory,
  updateMyBio,
  listCommittees,
  joinCommittee,
  leaveCommittee,
  feed,
  createPost,
  deletePost,
} from '../controllers/community.controller.js'

// Mounted behind authenticate + requireIntranet.
const router = Router()
router.get('/directory', directory)
router.patch('/me/video-bio', updateMyBio)
router.get('/committees', listCommittees)
router.post('/committees/:id/join', joinCommittee)
router.delete('/committees/:id/join', leaveCommittee)
router.get('/feed', feed)
router.post('/feed', createPost)
router.delete('/feed/:id', deletePost)

export default router

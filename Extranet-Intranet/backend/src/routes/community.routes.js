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
import { matchSuggestions } from '../controllers/aiEngine.controller.js'
import { cloudflareStreamWebhook, createVideoUpload, deleteVideoBio, muxWebhook, myVideoBio, playVideoBio } from '../controllers/videoBio.controller.js'

// Mounted behind authenticate + requireIntranet.
const router = Router()
router.get('/directory', directory)
router.get('/suggestions', matchSuggestions)
router.patch('/me/video-bio', updateMyBio)
router.get('/me/video-bio', myVideoBio)
router.post('/me/video-bio/upload', createVideoUpload)
router.delete('/me/video-bio', deleteVideoBio)
router.get('/video-bios/:userId', playVideoBio)
router.get('/committees', listCommittees)
router.post('/committees/:id/join', joinCommittee)
router.delete('/committees/:id/join', leaveCommittee)
router.get('/feed', feed)
router.post('/feed', createPost)
router.delete('/feed/:id', deletePost)

/** Signed provider webhooks for video processing (no JWT). */
export const videoWebhookRoutes = Router()
videoWebhookRoutes.post('/mux', muxWebhook)
videoWebhookRoutes.post('/cloudflare-stream', cloudflareStreamWebhook)

export default router

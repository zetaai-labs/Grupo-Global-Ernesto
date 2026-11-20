import { Router } from 'express'
import { listMetaLinks, createMetaLink, deleteMetaLink } from '../controllers/metaLinks.controller.js'

const router = Router()

router.get('/', listMetaLinks)
router.post('/', createMetaLink)
router.delete('/:id', deleteMetaLink)

export default router

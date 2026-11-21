import { Router } from 'express'
import {
  guardVault,
  listInvestors,
  createInvestor,
  getInvestor,
  updateInvestor,
  listRooms,
  createRoom,
  grantRoom,
  revokeRoom,
  uploadRoomDocument,
  getRoom,
  downloadRoomDocument,
  myVault,
} from '../controllers/vault.controller.js'
import { upload, persistUpload } from '../middleware/upload.js'

// Mounted behind authenticate. Anyone other than the Super Admin or an investor is
// denied, logged and reported (guardVault). Finer checks happen per route.
const router = Router()
router.use(guardVault)

router.get('/me', myVault)
router.get('/investors', listInvestors)
router.post('/investors', createInvestor)
router.get('/investors/:id', getInvestor)
router.patch('/investors/:id', updateInvestor)

router.get('/rooms', listRooms)
router.post('/rooms', createRoom)
router.get('/rooms/:roomId', getRoom)
router.post('/rooms/:roomId/access', grantRoom)
router.delete('/rooms/:roomId/access/:investorId', revokeRoom)
router.post('/rooms/:roomId/documents', upload.single('file'), persistUpload, uploadRoomDocument)
router.get('/rooms/:roomId/documents/:docId/download', downloadRoomDocument)

export default router

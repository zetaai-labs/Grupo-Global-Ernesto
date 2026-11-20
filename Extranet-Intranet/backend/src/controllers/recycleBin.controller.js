import { writeAudit } from '../services/audit.js'
import * as recycleBin from '../services/recycleBin.service.js'

function parseTarget(req, res) {
  const { type } = req.params
  const id = Number(req.params.id)
  if (!['folder', 'file'].includes(type)) {
    res.status(400).json({ message: 'Type must be folder or file.' })
    return null
  }
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: 'Invalid id.' })
    return null
  }
  return { type, id, table: type === 'folder' ? 'folders' : 'files' }
}

function sendError(res, error) {
  if (error.status) return res.status(error.status).json({ message: error.message })
  throw error
}

export async function listDeleted(req, res) {
  return res.json({ data: await recycleBin.listDeleted(req) })
}

export async function restoreItem(req, res) {
  const target = parseTarget(req, res)
  if (!target) return undefined
  try {
    await recycleBin.restore(req, target.type, target.id)
  } catch (error) {
    return sendError(res, error)
  }
  await writeAudit(req.user.sub, 'ITEM_RESTORED', target.table, target.id)
  return res.json({ message: 'Item restored.' })
}

export async function purgeItem(req, res) {
  const target = parseTarget(req, res)
  if (!target) return undefined
  try {
    await recycleBin.purge(req, target.type, target.id)
  } catch (error) {
    return sendError(res, error)
  }
  await writeAudit(req.user.sub, 'ITEM_PURGED', target.table, target.id)
  return res.json({ message: 'Item permanently deleted.' })
}

import { z } from 'zod'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { getIo } from '../sockets/io.js'
import { ROLE_DEFINITIONS, STAFF_ROLES } from '../config/roles.js'

/** Community module (Technical Spec §1.2): directory, activity feed, sector committees. */

const uuid = z.string().uuid()
const fail = (res, status, message) => res.status(status).json({ message })

export async function directory(req, res) {
  const params = [STAFF_ROLES]
  const filters = ["u.status = 'active'", 'r.name = ANY($1::text[])']
  const add = (sql, value) => {
    params.push(value)
    filters.push(sql.split('?').join(`$${params.length}`))
  }
  if (req.query.q) add('(u.name ILIKE ? OR o.legal_name ILIKE ?)', `%${req.query.q}%`)
  if (req.query.corridor) add('rg.code = ?', String(req.query.corridor).toUpperCase())
  if (req.query.org) {
    if (!uuid.safeParse(req.query.org).success) return fail(res, 400, 'Invalid organisation.')
    add('u.org_id = ?', req.query.org)
  }
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.video_bio_url, r.name AS role, rg.code AS corridor, o.org_id, o.legal_name AS organization,
            COALESCE((SELECT json_agg(c.name ORDER BY c.name) FROM community_committee_members m
                      JOIN community_committees c ON c.committee_id = m.committee_id WHERE m.user_id = u.id), '[]'::json) AS committees
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN regions rg ON rg.id = u.region_id
     LEFT JOIN organizations o ON o.org_id = u.org_id
     WHERE ${filters.join(' AND ')}
     ORDER BY u.name LIMIT 500`,
    params,
  )
  const units = await query("SELECT org_id, legal_name FROM organizations WHERE org_type IN ('PARENT', 'BUSINESS_UNIT') ORDER BY legal_name")
  return res.json({
    data: rows.map((row) => ({ ...row, role_label: ROLE_DEFINITIONS[row.role]?.label || row.role })),
    meta: { units: units.rows },
  })
}

const httpsUrl = z.string().trim().url().max(512).refine((value) => value.startsWith('https://'), 'The video link must use https.')

/** Stores the link to the user's video presentation (users.video_bio_url). */
export async function updateMyBio(req, res) {
  const value = req.body?.video_bio_url
  if (value === null || value === '') {
    await query('UPDATE users SET video_bio_url = NULL WHERE id = $1', [req.user.sub])
    return res.json({ message: 'Video bio removed.' })
  }
  const parsed = httpsUrl.safeParse(value)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Enter a valid https link.')
  await query('UPDATE users SET video_bio_url = $2 WHERE id = $1', [req.user.sub, parsed.data])
  await writeAudit(req.user.sub, 'VIDEO_BIO_UPDATED', 'users', req.user.sub)
  return res.json({ message: 'Video bio saved.' })
}

export async function listCommittees(req, res) {
  const { rows } = await query(
    `SELECT c.committee_id, c.name, c.sector, c.description,
            (SELECT COUNT(*)::int FROM community_committee_members m WHERE m.committee_id = c.committee_id) AS members,
            EXISTS (SELECT 1 FROM community_committee_members m WHERE m.committee_id = c.committee_id AND m.user_id = $1) AS joined
     FROM community_committees c ORDER BY c.name`,
    [req.user.sub],
  )
  return res.json({ data: rows })
}

export async function joinCommittee(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid committee.')
  const { rowCount } = await query(
    `INSERT INTO community_committee_members (committee_id, user_id)
     SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM community_committees WHERE committee_id = $1)
     ON CONFLICT DO NOTHING`,
    [req.params.id, req.user.sub],
  )
  const exists = await query('SELECT 1 FROM community_committees WHERE committee_id = $1', [req.params.id])
  if (!exists.rowCount) return fail(res, 404, 'Committee not found.')
  return res.status(rowCount ? 201 : 200).json({ message: 'Joined committee.' })
}

export async function leaveCommittee(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid committee.')
  await query('DELETE FROM community_committee_members WHERE committee_id = $1 AND user_id = $2', [req.params.id, req.user.sub])
  return res.json({ message: 'Left committee.' })
}

const POST_SELECT = `
  SELECT p.post_id, p.body, p.created_at, p.committee_id, p.author_id, c.name AS committee,
         u.name AS author, o.legal_name AS organization
  FROM community_posts p
  LEFT JOIN users u ON u.id = p.author_id
  LEFT JOIN organizations o ON o.org_id = u.org_id
  LEFT JOIN community_committees c ON c.committee_id = p.committee_id
`

export async function feed(req, res) {
  const params = []
  let where = ''
  if (req.query.committee) {
    if (!uuid.safeParse(req.query.committee).success) return fail(res, 400, 'Invalid committee.')
    params.push(req.query.committee)
    where = 'WHERE p.committee_id = $1'
  }
  const { rows } = await query(`${POST_SELECT} ${where} ORDER BY p.created_at DESC LIMIT 100`, params)
  return res.json({ data: rows.map((row) => ({ ...row, can_delete: row.author_id === req.user.sub || req.user.role === 'admin' })) })
}

const postSchema = z.object({
  body: z.string().trim().min(1).max(3000),
  committee_id: uuid.optional().nullable(),
})

export async function createPost(req, res) {
  const parsed = postSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, 'Write something to post (up to 3,000 characters).')
  const { body, committee_id: committeeId } = parsed.data
  if (committeeId) {
    const member = await query('SELECT 1 FROM community_committee_members WHERE committee_id = $1 AND user_id = $2', [committeeId, req.user.sub])
    if (!member.rowCount) return fail(res, 403, 'Join this committee to post in it.')
  }
  const { rows } = await query(
    'INSERT INTO community_posts (author_id, committee_id, body) VALUES ($1, $2, $3) RETURNING post_id',
    [req.user.sub, committeeId || null, body],
  )
  const post = (await query(`${POST_SELECT} WHERE p.post_id = $1`, [rows[0].post_id])).rows[0]
  // Real-time activity feed for connected staff.
  const io = getIo()
  if (io) {
    const staff = await query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.status = 'active' AND r.name = ANY($1::text[])",
      [STAFF_ROLES],
    )
    for (const { id } of staff.rows) io.to(`user:${id}`).emit('community:post', post)
  }
  return res.status(201).json({ data: post })
}

export async function deletePost(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid post.')
  const { rows } = await query('SELECT author_id FROM community_posts WHERE post_id = $1', [req.params.id])
  if (!rows[0]) return fail(res, 404, 'Post not found.')
  if (rows[0].author_id !== req.user.sub && req.user.role !== 'admin') return fail(res, 403, 'You can only delete your own posts.')
  await query('DELETE FROM community_posts WHERE post_id = $1', [req.params.id])
  await writeAudit(req.user.sub, 'COMMUNITY_POST_DELETED', 'community_posts', req.params.id)
  return res.json({ message: 'Post deleted.' })
}

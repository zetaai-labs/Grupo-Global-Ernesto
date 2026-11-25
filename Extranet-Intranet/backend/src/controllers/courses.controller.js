import { createHash } from 'node:crypto'
import { z } from 'zod'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { notifyRoles } from '../services/notification.service.js'
import { STAFF_ROLES } from '../config/roles.js'
import { resolveRemediation } from './governance.controller.js'

/** Courses & events (Schema Document §4.7, Technical Spec §1.2 Module 4). */

const MODULE_TYPES = ['EVENT', 'COMPLIANCE_COURSE', 'TECHNICAL_WORKSHOP']
const ACCESS_TIERS = ['ALL_EMPLOYEES', 'DELEGATES_ONLY', 'EXECUTIVES']
const TIER_ROLES = {
  ALL_EMPLOYEES: STAFF_ROLES,
  DELEGATES_ONLY: ['admin', 'manager', 'employee'],
  EXECUTIVES: ['admin', 'tech_admin', 'hr', 'finance', 'manager'],
}
const COURSE_AUTHORS = ['admin', 'hr']

const uuid = z.string().uuid()
const fail = (res, status, message) => res.status(status).json({ message })
const canAccess = (role, tier) => TIER_ROLES[tier]?.includes(role)

/** Never send correct answers to the browser: grading happens only on the server. */
function publicQuiz(quiz) {
  return quiz.map(({ question, options }, index) => ({ index, question, options }))
}

export function gradeQuiz(quiz, answers) {
  if (!quiz.length) return 100
  const correct = quiz.filter((item, index) => Number(answers?.[index]) === item.answer).length
  return Math.round((correct / quiz.length) * 100)
}

export function certificateHash({ itemId, userUuid, score, completedAt }) {
  return createHash('sha256').update(`GG-CERT|${itemId}|${userUuid}|${score}|${completedAt}`).digest('hex')
}

export async function listCourses(req, res) {
  const { rows } = await query(
    `SELECT c.item_id, c.module_type, c.title, c.description, c.access_tier, c.pass_mark, c.starts_at,
            jsonb_array_length(c.lessons) AS lessons, jsonb_array_length(c.quiz) AS questions,
            e.status, e.best_score, e.attempts, e.completed_at, e.certificate_hash,
            (SELECT COUNT(*)::int FROM course_enrollments x WHERE x.item_id = c.item_id AND x.status = 'COMPLETED') AS completions,
            (SELECT p.standard FROM course_packages p WHERE p.item_id = c.item_id) AS package_standard
     FROM community_events_courses c
     LEFT JOIN course_enrollments e ON e.item_id = c.item_id AND e.user_id = $1
     WHERE c.access_tier = ANY($2::text[])
        OR EXISTS (SELECT 1 FROM governance_sanctions s
                   WHERE s.user_id = $1 AND s.required_course_id = c.item_id AND s.status = 'ACTIVE')
     ORDER BY c.starts_at NULLS LAST, c.created_at DESC`,
    [req.user.sub, ACCESS_TIERS.filter((tier) => canAccess(req.user.role, tier))],
  )
  return res.json({ data: rows, meta: { module_types: MODULE_TYPES, access_tiers: ACCESS_TIERS, can_author: COURSE_AUTHORS.includes(req.user.role) } })
}

async function loadCourse(req, res) {
  if (!uuid.safeParse(req.params.id).success) {
    fail(res, 400, 'Invalid course id.')
    return null
  }
  const { rows } = await query('SELECT * FROM community_events_courses WHERE item_id = $1', [req.params.id])
  if (!rows[0]) {
    fail(res, 404, 'Course not found.')
    return null
  }
  const required = await query(
    "SELECT 1 FROM governance_sanctions WHERE user_id = $1 AND required_course_id = $2 AND status = 'ACTIVE'",
    [req.user.sub, rows[0].item_id],
  )
  if (!canAccess(req.user.role, rows[0].access_tier) && !required.rowCount) {
    fail(res, 403, 'This course is not available for your role.')
    return null
  }
  return rows[0]
}

export { loadCourse, COURSE_AUTHORS }

export async function getCourse(req, res) {
  const course = await loadCourse(req, res)
  if (!course) return undefined
  const enrollment = await query('SELECT status, best_score, attempts, completed_at, certificate_hash FROM course_enrollments WHERE item_id = $1 AND user_id = $2', [course.item_id, req.user.sub])
  const pkg = await query(
    `SELECT p.package_id, p.standard, p.title, p.file_count, p.total_bytes, p.original_name, p.mastery_score, p.created_at,
            a.lesson_status, a.score, a.total_seconds, a.launches, a.completed_at
     FROM course_packages p
     LEFT JOIN course_attempts a ON a.package_id = p.package_id AND a.user_id = $2
     WHERE p.item_id = $1`,
    [course.item_id, req.user.sub],
  )
  const { quiz, ...rest } = course
  return res.json({ data: { ...rest, quiz: publicQuiz(quiz), enrollment: enrollment.rows[0] || null, package: pkg.rows[0] || null, can_author: COURSE_AUTHORS.includes(req.user.role) } })
}

const courseSchema = z.object({
  module_type: z.enum(MODULE_TYPES),
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  access_tier: z.enum(ACCESS_TIERS).default('ALL_EMPLOYEES'),
  pass_mark: z.coerce.number().int().min(1).max(100).default(70),
  starts_at: z.string().optional().nullable(),
  lessons: z.array(z.object({ title: z.string().trim().min(1).max(255), body: z.string().trim().min(1).max(20000) })).max(50).default([]),
  quiz: z.array(z.object({
    question: z.string().trim().min(3).max(1000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
    answer: z.number().int().min(0),
  })).max(50).default([]),
}).refine((data) => data.quiz.every((item) => item.answer < item.options.length), 'Each correct answer must match one of the options.')

export async function createCourse(req, res) {
  if (!COURSE_AUTHORS.includes(req.user.role)) return fail(res, 403, 'Only HR and the Super Administrator can create courses.')
  const parsed = courseSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid course.')
  const data = parsed.data
  if (data.starts_at && Number.isNaN(Date.parse(data.starts_at))) return fail(res, 400, 'Invalid start date.')
  try {
    const { rows } = await query(
      `INSERT INTO community_events_courses (module_type, title, description, access_tier, pass_mark, starts_at, lessons, quiz, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING item_id`,
      [data.module_type, data.title, data.description || null, data.access_tier, data.pass_mark, data.starts_at || null,
        JSON.stringify(data.lessons), JSON.stringify(data.quiz), req.user.sub],
    )
    await notifyRoles(TIER_ROLES[data.access_tier], { type: 'course', title: `New ${data.module_type === 'EVENT' ? 'event' : 'course'}: ${data.title}`, link: '/intranet/courses' }, req.user.sub)
    await writeAudit(req.user.sub, 'COURSE_CREATED', 'community_events_courses', rows[0].item_id)
    return res.status(201).json({ data: rows[0] })
  } catch (error) {
    if (error.code === '23505') return fail(res, 409, 'A course with this title already exists.')
    throw error
  }
}

export async function enroll(req, res) {
  const course = await loadCourse(req, res)
  if (!course) return undefined
  await query('INSERT INTO course_enrollments (item_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [course.item_id, req.user.sub])
  return res.status(201).json({ message: course.module_type === 'EVENT' ? 'You are registered for this event.' : 'Enrolled.' })
}

/** Automated grading; a pass issues a SHA-256 certificate hash. */
export async function submitQuiz(req, res) {
  const course = await loadCourse(req, res)
  if (!course) return undefined
  if (!course.quiz.length) return fail(res, 400, 'This item has no assessment.')
  const answers = req.body?.answers
  if (!Array.isArray(answers) || answers.length !== course.quiz.length) return fail(res, 400, 'Answer every question.')

  const existing = await query('SELECT status, certificate_hash, best_score FROM course_enrollments WHERE item_id = $1 AND user_id = $2', [course.item_id, req.user.sub])
  if (existing.rows[0]?.status === 'COMPLETED') {
    return res.json({ data: { passed: true, score: existing.rows[0].best_score, certificate_hash: existing.rows[0].certificate_hash }, message: 'You have already completed this course.' })
  }

  const score = gradeQuiz(course.quiz, answers)
  const passed = score >= course.pass_mark
  const result = await recordResult({ course, user: req.user, score, passed })
  return res.json({
    data: { passed, score, pass_mark: course.pass_mark, certificate_hash: result.certificate_hash },
    message: passed ? `Passed with ${score}%. Certificate issued.` : `Score ${score}%. You need ${course.pass_mark}% to pass. Try again.`,
  })
}

/**
 * Records a quiz or package result for the signed-in user (`user` = req.user: sub, uuid, name).
 * A pass issues the SHA-256 certificate once and clears any sanction that required this course.
 */
export async function recordResult({ course, user, score, passed }) {
  const existing = await query('SELECT status, certificate_hash, best_score FROM course_enrollments WHERE item_id = $1 AND user_id = $2', [course.item_id, user.sub])
  if (existing.rows[0]?.status === 'COMPLETED') return { already: true, certificate_hash: existing.rows[0].certificate_hash, best_score: existing.rows[0].best_score }

  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null
  const completedAt = passed ? new Date().toISOString() : null
  const hash = passed ? certificateHash({ itemId: course.item_id, userUuid: user.uuid, score: safeScore ?? 100, completedAt }) : null
  await query(
    `INSERT INTO course_enrollments (item_id, user_id, status, attempts, best_score, completed_at, certificate_hash)
     VALUES ($1, $2, $3, 1, $4, $5, $6)
     ON CONFLICT (item_id, user_id) DO UPDATE SET
       status = EXCLUDED.status,
       attempts = course_enrollments.attempts + 1,
       best_score = GREATEST(course_enrollments.best_score, EXCLUDED.best_score),
       completed_at = EXCLUDED.completed_at,
       certificate_hash = EXCLUDED.certificate_hash`,
    [course.item_id, user.sub, passed ? 'COMPLETED' : 'FAILED', passed ? (safeScore ?? 100) : safeScore, completedAt, hash],
  )
  await writeAudit(user.sub, passed ? 'COURSE_PASSED' : 'COURSE_FAILED', 'community_events_courses', course.item_id, { score: safeScore })
  if (passed) await resolveRemediation(user.sub, user.name, course.item_id)
  return { already: false, certificate_hash: hash, best_score: safeScore }
}

/** Public certificate verification by SHA-256 hash (no personal data beyond the holder's name). */
export async function verifyCertificate(req, res) {
  if (!/^[0-9a-f]{64}$/.test(req.params.hash)) return fail(res, 400, 'Invalid certificate code.')
  const { rows } = await query(
    `SELECT u.name AS holder, c.title AS course, c.module_type, e.best_score AS score, e.completed_at
     FROM course_enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN community_events_courses c ON c.item_id = e.item_id
     WHERE e.certificate_hash = $1 AND e.status = 'COMPLETED' AND u.status <> 'erased'`,
    [req.params.hash],
  )
  if (!rows[0]) return res.status(404).json({ data: { valid: false }, message: 'Certificate not found.' })
  return res.json({ data: { valid: true, ...rows[0] } })
}

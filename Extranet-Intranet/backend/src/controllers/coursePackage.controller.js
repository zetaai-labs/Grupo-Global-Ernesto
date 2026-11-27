import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { loadCourse, recordResult, COURSE_AUTHORS } from './courses.controller.js'
import {
  PackageError, extractPackage, packageDir, signContentToken, verifyContentToken,
  cleanCmi, scormOutcome, scormScore, statusOf, durationSeconds,
} from '../services/coursePackage.service.js'

/**
 * SCORM 1.2 / 2004 and xAPI packages for Courses & Events.
 *
 * Security model: package files are served from /api/course-content/<signed token>/… with a
 * `Content-Security-Policy: sandbox` header, so uploaded code runs in an opaque origin and
 * cannot read the app's storage or call the API with the user's session. A small runtime
 * script injected into every HTML page provides the SCORM API (window.API / API_1484_11)
 * and reports to the parent window by postMessage; the app saves progress with the
 * user's own session. xAPI packages report to a minimal LRS bound to the same token.
 */

const fail = (res, status, message) => res.status(status).json({ message })

// ------------------------------------------------------------------ authoring
export async function uploadPackage(req, res) {
  if (!COURSE_AUTHORS.includes(req.user.role)) return fail(res, 403, 'Only HR and the Super Administrator can upload course packages.')
  const course = await loadCourse(req, res)
  if (!course) return undefined
  if (!req.file) return fail(res, 400, 'Choose a SCORM or xAPI .zip file.')

  const existing = await query('SELECT package_id FROM course_packages WHERE item_id = $1', [course.item_id])
  const packageId = existing.rows[0]?.package_id || randomUUID()
  const staging = `${packageDir(packageId)}.staging-${Date.now()}`
  let info
  try {
    info = await extractPackage(req.file.buffer, staging)
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true })
    if (error instanceof PackageError) return fail(res, 400, error.message)
    throw error
  }
  // Swap the new files in only after the whole archive was accepted.
  await fs.rm(packageDir(packageId), { recursive: true, force: true })
  await fs.rename(staging, packageDir(packageId))

  await query(
    `INSERT INTO course_packages (package_id, item_id, standard, title, launch_path, activity_id, mastery_score, file_count, total_bytes, original_name, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (item_id) DO UPDATE SET standard = EXCLUDED.standard, title = EXCLUDED.title, launch_path = EXCLUDED.launch_path,
       activity_id = EXCLUDED.activity_id, mastery_score = EXCLUDED.mastery_score, file_count = EXCLUDED.file_count,
       total_bytes = EXCLUDED.total_bytes, original_name = EXCLUDED.original_name, uploaded_by = EXCLUDED.uploaded_by`,
    [packageId, course.item_id, info.standard, info.title?.slice(0, 255) || null, info.launchPath, info.activityId?.slice(0, 2000) || null,
      info.masteryScore, info.fileCount, info.totalBytes, String(req.file.originalname || '').slice(0, 255), req.user.sub],
  )
  await writeAudit(req.user.sub, 'COURSE_PACKAGE_UPLOADED', 'community_events_courses', course.item_id, { standard: info.standard, files: info.fileCount })
  return res.status(201).json({
    data: { package_id: packageId, standard: info.standard, title: info.title, file_count: info.fileCount, total_bytes: info.totalBytes },
    message: 'Course package uploaded.',
  })
}

export async function deletePackage(req, res) {
  if (!COURSE_AUTHORS.includes(req.user.role)) return fail(res, 403, 'Only HR and the Super Administrator can remove course packages.')
  const course = await loadCourse(req, res)
  if (!course) return undefined
  const { rows } = await query('DELETE FROM course_packages WHERE item_id = $1 RETURNING package_id', [course.item_id])
  if (!rows[0]) return fail(res, 404, 'This course has no package.')
  await fs.rm(packageDir(rows[0].package_id), { recursive: true, force: true })
  await writeAudit(req.user.sub, 'COURSE_PACKAGE_REMOVED', 'community_events_courses', course.item_id)
  return res.json({ message: 'Course package removed.' })
}

// ------------------------------------------------------------------ learner
async function packageFor(courseId) {
  const { rows } = await query('SELECT * FROM course_packages WHERE item_id = $1', [courseId])
  return rows[0] || null
}

/** Starts (or resumes) the learner's attempt and returns the sandboxed launch URL. */
export async function launchPackage(req, res) {
  const course = await loadCourse(req, res)
  if (!course) return undefined
  const pkg = await packageFor(course.item_id)
  if (!pkg) return fail(res, 404, 'This course has no package.')
  const origin = typeof req.body?.origin === 'string' && /^https?:\/\/[A-Za-z0-9.:[\]-]+$/.test(req.body.origin) ? req.body.origin : ''

  const { rows } = await query(
    `INSERT INTO course_attempts (package_id, user_id, launches) VALUES ($1, $2, 1)
     ON CONFLICT (package_id, user_id) DO UPDATE SET launches = course_attempts.launches + 1, updated_at = now()
     RETURNING attempt_id`,
    [pkg.package_id, req.user.sub],
  )
  await query('INSERT INTO course_enrollments (item_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [course.item_id, req.user.sub])
  const attemptId = rows[0].attempt_id
  const token = signContentToken({ attemptId, packageId: pkg.package_id, userId: req.user.sub })
  const base = `/api/course-content/${token}/`
  let url = base + pkg.launch_path.split('/').map((part) => encodeURIComponent(part).replace(/%3F/g, '?').replace(/%3D/g, '=').replace(/%26/g, '&').replace(/%23/g, '#')).join('/')

  if (pkg.standard === 'XAPI') {
    const params = new URLSearchParams({
      endpoint: `${origin}${base}xapi/`,
      auth: `Basic ${Buffer.from(`gg:${attemptId}`).toString('base64')}`,
      actor: JSON.stringify(actorFor(req.user.uuid, req.user.name, origin)),
      registration: attemptId,
      ...(pkg.activity_id ? { activity_id: pkg.activity_id } : {}),
    })
    url += (url.includes('?') ? '&' : '?') + params.toString()
  }
  return res.json({ data: { url, token, standard: pkg.standard } })
}

const actorFor = (uuid, name, origin) => ({ objectType: 'Agent', name, account: { homePage: origin || 'https://grupoglobal.example', name: uuid } })

/** Saves SCORM runtime data sent by the app's player (the learner's own session). */
export async function saveRuntime(req, res) {
  const course = await loadCourse(req, res)
  if (!course) return undefined
  const claims = verifyContentToken(req.body?.token)
  const pkg = await packageFor(course.item_id)
  if (!pkg || !claims || claims.packageId !== pkg.package_id || claims.userId !== req.user.sub) return fail(res, 403, 'This course session has expired. Open the course again.')
  if (pkg.standard === 'XAPI') return res.json({ data: { status: 'xapi' } })
  const updates = cleanCmi(req.body?.cmi)
  if (!updates) return fail(res, 400, 'Invalid course data.')

  const { rows } = await query('SELECT * FROM course_attempts WHERE attempt_id = $1 AND user_id = $2', [claims.attemptId, req.user.sub])
  const attempt = rows[0]
  if (!attempt) return fail(res, 404, 'Course attempt not found.')
  const cmi = { ...attempt.cmi, ...updates }
  const finished = req.body?.finished === true
  const sessionKey = pkg.standard === 'SCORM_2004' ? 'cmi.session_time' : 'cmi.core.session_time'
  const addSeconds = finished ? durationSeconds(updates[sessionKey]) : 0
  const passMark = pkg.mastery_score ?? course.pass_mark
  const score = scormScore(pkg.standard, cmi)
  const outcome = scormOutcome(pkg.standard, cmi, passMark)

  await query(
    `UPDATE course_attempts SET cmi = $2, lesson_status = $3, score = $4, total_seconds = total_seconds + $5,
       completed_at = CASE WHEN $6 THEN COALESCE(completed_at, now()) ELSE completed_at END, updated_at = now()
     WHERE attempt_id = $1`,
    [attempt.attempt_id, JSON.stringify(cmi), String(statusOf(pkg.standard, cmi)).slice(0, 40), score, addSeconds, outcome === 'passed'],
  )
  let result = null
  if (outcome === 'passed') result = await recordResult({ course, user: req.user, score, passed: true })
  else if (outcome === 'failed' && finished) result = await recordResult({ course, user: req.user, score, passed: false })
  return res.json({ data: { status: statusOf(pkg.standard, cmi), score, outcome, certificate_hash: result?.certificate_hash || null } })
}

// ------------------------------------------------------------------ sandboxed content
const TYPES = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', xml: 'application/xml', xsd: 'application/xml', txt: 'text/plain; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', vtt: 'text/vtt',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject', pdf: 'application/pdf',
  swf: 'application/x-shockwave-flash', csv: 'text/csv; charset=utf-8', wasm: 'application/wasm',
}

/** Headers for every package response: sandboxed, framable only by the app, no sniffing. */
export function contentHeaders(_req, res, next) {
  res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads; frame-ancestors 'self'")
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Experience-API-Version, If-Match, If-None-Match')
  res.setHeader('Access-Control-Expose-Headers', 'X-Experience-API-Version, ETag, Last-Modified')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  // The app page sends COEP; a framed course page must send it too or the browser refuses to show it.
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Robots-Tag', 'noindex')
  if (_req.method === 'OPTIONS') return res.status(204).setHeader('Access-Control-Max-Age', '600').end()
  return next()
}

/** Resolves the token in the URL to the attempt; 403 when missing or expired. */
export async function contentAuth(req, res, next) {
  const claims = verifyContentToken(req.params.token)
  if (!claims) return res.status(403).type('text/plain').send('This course link has expired. Open the course again from the intranet.')
  const { rows } = await query(
    `SELECT a.attempt_id, a.cmi, a.lesson_status, a.total_seconds, p.package_id, p.standard, p.mastery_score, p.activity_id, p.item_id,
            u.id AS user_id, u.uuid AS user_uuid, u.name AS user_name, u.status AS user_status
     FROM course_attempts a
     JOIN course_packages p ON p.package_id = a.package_id
     JOIN users u ON u.id = a.user_id
     WHERE a.attempt_id = $1 AND a.package_id = $2 AND a.user_id = $3`,
    [claims.attemptId, claims.packageId, claims.userId],
  )
  if (!rows[0] || rows[0].user_status !== 'active') return res.status(403).type('text/plain').send('This course link is no longer valid.')
  req.courseAttempt = rows[0]
  return next()
}

const pad = (value) => String(value).padStart(2, '0')
const hhmmss = (seconds) => `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`

/** Runtime data the SCORM API starts with: stored values plus identity and resume information. */
export function initialCmi(attempt) {
  const stored = attempt.cmi || {}
  const resume = Boolean(stored['cmi.suspend_data'] || stored['cmi.core.lesson_location'] || stored['cmi.location'])
  if (attempt.standard === 'SCORM_2004') {
    return {
      'cmi.completion_status': 'unknown', 'cmi.success_status': 'unknown', 'cmi.mode': 'normal', 'cmi.credit': 'credit', 'cmi.launch_data': '',
      ...(attempt.mastery_score !== null && attempt.mastery_score !== undefined ? { 'cmi.scaled_passing_score': String(attempt.mastery_score / 100) } : {}),
      ...stored,
      'cmi.learner_id': attempt.user_uuid,
      'cmi.learner_name': attempt.user_name,
      'cmi.entry': resume ? 'resume' : 'ab-initio',
      'cmi.total_time': `PT${attempt.total_seconds || 0}S`,
    }
  }
  return {
    'cmi.core.lesson_status': 'not attempted', 'cmi.core.credit': 'credit', 'cmi.core.lesson_mode': 'normal', 'cmi.launch_data': '',
    'cmi.student_data.mastery_score': attempt.mastery_score === null || attempt.mastery_score === undefined ? '' : String(attempt.mastery_score),
    ...stored,
    'cmi.core.student_id': attempt.user_uuid,
    'cmi.core.student_name': attempt.user_name,
    'cmi.core.entry': resume ? 'resume' : 'ab-initio',
    'cmi.core.total_time': hhmmss(attempt.total_seconds || 0),
  }
}

// Injected into every HTML page of a SCORM package (runs inside the sandbox).
const RUNTIME = `(function(){var D=window.__GG_COURSE__;if(!D)return;var s=D.cmi||{},dirty=false,done=false,err='0';
function post(t){try{window.top.postMessage({source:'gg-course',token:D.token,type:t,cmi:s},'*')}catch(e){}}
function count(p){var max=-1,pre=p+'.';for(var k in s){if(k.indexOf(pre)===0){var n=parseInt(k.slice(pre.length),10);if(!isNaN(n)&&n>max)max=n}}return String(max+1)}
var CH={'cmi.core._children':'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time','cmi.core.score._children':'raw,min,max','cmi.score._children':'scaled,raw,min,max','cmi.objectives._children':'id,score,status,success_status,completion_status,description','cmi.interactions._children':'id,type,objectives,timestamp,correct_responses,weighting,learner_response,student_response,result,latency,description'};
function get(k){err='0';k=String(k);if(/\\._count$/.test(k))return count(k.slice(0,-7));if(/\\._children$/.test(k))return CH[k]||'';if(k==='cmi._version')return '1.0';return Object.prototype.hasOwnProperty.call(s,k)?String(s[k]):''}
function set(k,v){err='0';s[String(k)]=String(v);dirty=true;return 'true'}
function commit(){if(dirty){post('commit');dirty=false}return 'true'}
function finish(){if(done)return 'true';done=true;post('finish');dirty=false;return 'true'}
function init(){post('initialize');return 'true'}
function le(){return err}function es(){return ''}
window.API={LMSInitialize:init,LMSFinish:finish,LMSGetValue:get,LMSSetValue:set,LMSCommit:commit,LMSGetLastError:le,LMSGetErrorString:es,LMSGetDiagnostic:es};
window.API_1484_11={Initialize:init,Terminate:finish,GetValue:get,SetValue:set,Commit:commit,GetLastError:le,GetErrorString:es,GetDiagnostic:es};
setInterval(function(){if(dirty)commit()},30000);
window.addEventListener('pagehide',function(){if(dirty){post('commit');dirty=false}});})();`

// Escapes "<" and line separators so JSON can sit inside a <script> tag (written without backslash literals).
const escapeUnicode = (ch) => `${String.fromCharCode(92)}u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
const SCRIPT_UNSAFE = new RegExp(`[<${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g')
const safeJson = (value) => JSON.stringify(value).replace(SCRIPT_UNSAFE, escapeUnicode)

export function injectRuntime(html, data) {
  const tag = `<script>window.__GG_COURSE__=${safeJson(data)};${RUNTIME}</script>`
  const head = html.match(/<head\b[^>]*>/i)
  if (head) return html.replace(head[0], `${head[0]}${tag}`)
  const root = html.match(/<html\b[^>]*>/i)
  if (root) return html.replace(root[0], `${root[0]}${tag}`)
  return tag + html
}

/** Serves one package file; HTML pages get the SCORM runtime. */
export async function serveContent(req, res) {
  const attempt = req.courseAttempt
  const parts = (Array.isArray(req.params.path) ? req.params.path : String(req.params.path || '').split('/')).filter(Boolean)
  if (!parts.length || parts.some((part) => part === '..' || part.startsWith('.') || /[\\\u0000]/.test(part))) return res.status(404).end()
  const root = packageDir(attempt.package_id)
  const file = path.join(root, ...parts)
  if (!file.startsWith(root + path.sep)) return res.status(404).end()
  const extension = path.extname(file).slice(1).toLowerCase()
  const type = TYPES[extension] || 'application/octet-stream'
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if ((extension === 'html' || extension === 'htm') && attempt.standard !== 'XAPI') {
    let html
    try {
      html = await fs.readFile(file, 'utf8')
    } catch {
      return res.status(404).end()
    }
    res.setHeader('Cache-Control', 'no-store')
    return res.type(type).send(injectRuntime(html, { token: req.params.token, standard: attempt.standard, cmi: initialCmi(attempt) }))
  }
  return res.sendFile(file, { headers: { 'Content-Type': type }, dotfiles: 'deny' }, (error) => {
    if (error && !res.headersSent) res.status(error.status === 404 || error.code === 'ENOENT' ? 404 : 500).end()
  })
}

// ------------------------------------------------------------------ minimal xAPI LRS
const XAPI_VERSION = '1.0.3'
const xapi = (res) => res.setHeader('X-Experience-API-Version', XAPI_VERSION)

export function xapiAbout(_req, res) {
  xapi(res)
  return res.json({ version: [XAPI_VERSION, '1.0.0'] })
}

function statementScore(statement) {
  const score = statement?.result?.score
  if (!score) return null
  if (Number.isFinite(Number(score.scaled)) && score.scaled !== null && score.scaled !== '') return Math.max(0, Math.min(100, Math.round(Number(score.scaled) * 100)))
  if (Number.isFinite(Number(score.raw))) {
    const min = Number.isFinite(Number(score.min)) ? Number(score.min) : 0
    const max = Number.isFinite(Number(score.max)) ? Number(score.max) : 100
    if (max > min) return Math.max(0, Math.min(100, Math.round(((Number(score.raw) - min) / (max - min)) * 100)))
  }
  return null
}

async function applyStatement(attempt, statement) {
  const verb = String(statement?.verb?.id || '')
  const kind = /\/(passed|completed|failed|mastered)$/.exec(verb)?.[1]
  if (!kind) return
  const { rows } = await query('SELECT * FROM community_events_courses WHERE item_id = $1', [attempt.item_id])
  const course = rows[0]
  if (!course) return
  const score = statementScore(statement)
  const passMark = attempt.mastery_score ?? course.pass_mark
  const success = statement?.result?.success
  let passed = null
  if (kind === 'passed' || kind === 'mastered') passed = true
  else if (kind === 'failed' || success === false) passed = false
  else if (kind === 'completed') passed = score === null || score >= passMark
  if (passed === null) return
  await query(
    `UPDATE course_attempts SET lesson_status = $2, score = COALESCE($3, score), updated_at = now(),
       completed_at = CASE WHEN $4 THEN COALESCE(completed_at, now()) ELSE completed_at END
     WHERE attempt_id = $1`,
    [attempt.attempt_id, passed ? 'passed' : 'failed', score, passed],
  )
  await recordResult({ course, user: { sub: attempt.user_id, uuid: attempt.user_uuid, name: attempt.user_name }, score, passed })
}

async function storeStatement(attempt, statement, givenId) {
  if (!statement || typeof statement !== 'object' || Array.isArray(statement) || !statement.verb?.id || !statement.object) {
    const error = new Error('Invalid statement.')
    error.status = 400
    throw error
  }
  const id = /^[0-9a-f-]{36}$/i.test(givenId || statement.id || '') ? (givenId || statement.id) : randomUUID()
  const stored = { ...statement, id, stored: new Date().toISOString(), timestamp: statement.timestamp || new Date().toISOString(), authority: { objectType: 'Agent', name: 'Grupo Global LRS', account: { homePage: 'https://grupoglobal.example', name: 'lrs' } }, version: statement.version || XAPI_VERSION }
  const { rowCount } = await query(
    'INSERT INTO xapi_statements (statement_id, attempt_id, verb, statement) VALUES ($1, $2, $3, $4) ON CONFLICT (statement_id) DO NOTHING',
    [id, attempt.attempt_id, String(statement.verb.id).slice(0, 500), JSON.stringify(stored)],
  )
  if (rowCount) await applyStatement(attempt, stored)
  return id
}

export async function xapiPostStatements(req, res) {
  xapi(res)
  const body = req.body
  const list = Array.isArray(body) ? body : [body]
  if (!list.length || list.length > 100) return res.status(400).json({ message: 'Send between 1 and 100 statements.' })
  try {
    const ids = []
    for (const statement of list) ids.push(await storeStatement(req.courseAttempt, statement))
    return res.json(ids)
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message })
    throw error
  }
}

export async function xapiPutStatement(req, res) {
  xapi(res)
  const id = String(req.query.statementId || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ message: 'statementId is required.' })
  try {
    await storeStatement(req.courseAttempt, req.body, id)
    return res.status(204).end()
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message })
    throw error
  }
}

export async function xapiGetStatements(req, res) {
  xapi(res)
  if (req.query.statementId) {
    const { rows } = await query('SELECT statement FROM xapi_statements WHERE attempt_id = $1 AND statement_id::text = $2', [req.courseAttempt.attempt_id, String(req.query.statementId)])
    return rows[0] ? res.json(rows[0].statement) : res.status(404).end()
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
  const { rows } = await query('SELECT statement FROM xapi_statements WHERE attempt_id = $1 ORDER BY stored_at DESC LIMIT $2', [req.courseAttempt.attempt_id, limit])
  return res.json({ statements: rows.map((row) => row.statement), more: '' })
}

const stateKey = (req) => ({ activity: String(req.query.activityId || '').slice(0, 2000), state: req.query.stateId === undefined ? null : String(req.query.stateId).slice(0, 500) })
const bodyText = (req) => (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? ''))

export async function xapiState(req, res) {
  xapi(res)
  const { activity, state } = stateKey(req)
  if (!activity) return res.status(400).json({ message: 'activityId is required.' })
  const attemptId = req.courseAttempt.attempt_id
  if (req.method === 'GET') {
    if (state === null) {
      const { rows } = await query('SELECT state_id FROM xapi_state WHERE attempt_id = $1 AND activity_id = $2', [attemptId, activity])
      return res.json(rows.map((row) => row.state_id))
    }
    const { rows } = await query('SELECT content_type, body FROM xapi_state WHERE attempt_id = $1 AND activity_id = $2 AND state_id = $3', [attemptId, activity, state])
    return rows[0] ? res.type(rows[0].content_type).send(rows[0].body) : res.status(404).end()
  }
  if (req.method === 'DELETE') {
    await query(`DELETE FROM xapi_state WHERE attempt_id = $1 AND activity_id = $2 ${state === null ? '' : 'AND state_id = $3'}`, state === null ? [attemptId, activity] : [attemptId, activity, state])
    return res.status(204).end()
  }
  if (state === null) return res.status(400).json({ message: 'stateId is required.' })
  const contentType = String(req.get('content-type') || 'application/octet-stream').split(';')[0].slice(0, 100)
  let text = bodyText(req)
  if (text.length > 1024 * 1024) return res.status(413).end()
  if (req.method === 'POST' && contentType === 'application/json') {
    const current = await query('SELECT body, content_type FROM xapi_state WHERE attempt_id = $1 AND activity_id = $2 AND state_id = $3', [attemptId, activity, state])
    if (current.rows[0]?.content_type === 'application/json') {
      try { text = JSON.stringify({ ...JSON.parse(current.rows[0].body), ...JSON.parse(text) }) } catch { return res.status(400).json({ message: 'Both documents must be JSON objects.' }) }
    }
  }
  await query(
    `INSERT INTO xapi_state (attempt_id, activity_id, state_id, content_type, body) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (attempt_id, activity_id, state_id) DO UPDATE SET content_type = EXCLUDED.content_type, body = EXCLUDED.body, updated_at = now()`,
    [attemptId, activity, state, contentType, text],
  )
  return res.status(204).end()
}

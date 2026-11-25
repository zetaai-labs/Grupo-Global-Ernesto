import { randomUUID } from 'node:crypto'
import { statfs } from 'node:fs/promises'
import os from 'node:os'
import { config } from '../config/env.js'
import { query } from '../config/database.js'

/**
 * Monitoring without extra services: request IDs, one-line JSON logs, live request metrics,
 * scheduled-job status with failure alerts, and optional error reporting to Sentry (SENTRY_DSN).
 * Logs never contain request bodies, headers, query strings or tokens.
 */

const STARTED_AT = Date.now()
const WINDOW_MS = 15 * 60 * 1000
const ALERT_EVERY_MS = 6 * 60 * 60 * 1000
const REQUEST_ID = /^[A-Za-z0-9_.-]{8,64}$/
const underTest = () => Boolean(process.env.NODE_TEST_CONTEXT) || process.env.NODE_ENV === 'test'
const logRequests = () => (process.env.LOG_REQUESTS ? process.env.LOG_REQUESTS === 'true' : !underTest())

export function log(level, message, fields = {}) {
  if (underTest() && process.env.LOG_IN_TESTS !== 'true') return
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields })
  if (level === 'error') console.error(line)
  else console.log(line)
}

// ------------------------------------------------------------------ requests
const samples = [] // { at, ms, status }
const recentErrors = [] // last 20 server errors

function prune(now = Date.now()) {
  while (samples.length && now - samples[0].at > WINDOW_MS) samples.shift()
  if (samples.length > 20000) samples.splice(0, samples.length - 20000)
}

/** Express middleware: request ID, timing, access log line, metrics. */
export function requestMonitor(req, res, next) {
  const incoming = req.get('x-request-id')
  req.id = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID().replace(/-/g, '').slice(0, 16)
  res.setHeader('X-Request-Id', req.id)
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    samples.push({ at: Date.now(), ms, status: res.statusCode })
    prune()
    if (logRequests()) {
      log(res.statusCode >= 500 ? 'error' : 'info', 'request', {
        request_id: req.id,
        method: req.method,
        path: (req.originalUrl || req.url).split('?')[0].slice(0, 200),
        status: res.statusCode,
        ms: Math.round(ms),
        user: req.user?.sub || undefined,
      })
    }
  })
  next()
}

export function requestStats() {
  prune()
  const durations = samples.map((sample) => sample.ms).sort((a, b) => a - b)
  const pick = (q) => (durations.length ? Math.round(durations[Math.min(durations.length - 1, Math.floor(q * durations.length))]) : 0)
  const errors = samples.filter((sample) => sample.status >= 500).length
  return {
    window_minutes: WINDOW_MS / 60000,
    requests: samples.length,
    server_errors: errors,
    error_rate: samples.length ? Math.round((errors / samples.length) * 10000) / 100 : 0,
    p50_ms: pick(0.5),
    p95_ms: pick(0.95),
  }
}

// ------------------------------------------------------------------ errors
let sentWindow = { start: 0, count: 0 }

function parseDsn(dsn) {
  try {
    const url = new URL(dsn)
    const project = url.pathname.replace(/^\/+|\/+$/g, '')
    if (url.protocol !== 'https:' || !url.username || !/^\d+$/.test(project)) return null
    return { key: url.username, host: url.host, project, dsn }
  } catch {
    return null
  }
}

export const sentryConfigured = () => Boolean(parseDsn(process.env.SENTRY_DSN || ''))

/** Sends one error to Sentry (envelope API). At most 30 per minute; never throws. */
async function reportToSentry(error, context) {
  const target = parseDsn(process.env.SENTRY_DSN || '')
  if (!target) return
  const now = Date.now()
  if (now - sentWindow.start > 60000) sentWindow = { start: now, count: 0 }
  if (++sentWindow.count > 30) return
  const eventId = randomUUID().replace(/-/g, '')
  const event = {
    event_id: eventId,
    timestamp: now / 1000,
    platform: 'node',
    level: 'error',
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
    release: process.env.APP_RELEASE || undefined,
    exception: { values: [{ type: error?.name || 'Error', value: String(error?.message || error).slice(0, 1000) }] },
    tags: { request_id: context.request_id, kind: context.kind },
    extra: { stack: String(error?.stack || '').slice(0, 8000), path: context.path, method: context.method, job: context.job },
    user: context.user ? { id: String(context.user) } : undefined,
  }
  const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date(now).toISOString(), dsn: target.dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`
  try {
    await fetch(`https://${target.host}/api/${target.project}/envelope/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=gg-monitor/1.0` },
      body,
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Monitoring must never break the app.
  }
}

/** Records a server error (log line, recent list, Sentry). */
export function captureError(error, context = {}) {
  const entry = {
    time: new Date().toISOString(),
    kind: context.kind || 'request',
    request_id: context.request_id || null,
    method: context.method || null,
    path: context.path || null,
    job: context.job || null,
    message: String(error?.message || error).slice(0, 300),
  }
  recentErrors.unshift(entry)
  recentErrors.length = Math.min(recentErrors.length, 20)
  log('error', 'error', { ...entry, stack: String(error?.stack || '').split('\n').slice(0, 6).join(' | ') })
  reportToSentry(error, context)
}

/** Express error handler: 500s are captured and answered with a reference the user can quote. */
export function errorHandler(error, req, res, _next) {
  const status = Number(error.status || error.statusCode) || 500
  // Only real crashes (500) are reported and hidden behind a reference. Deliberate answers such as
  // 502 "the provider refused" or 503 "not set up yet" keep their status and message.
  if (status === 500) {
    captureError(error, { request_id: req.id, method: req.method, path: (req.originalUrl || '').split('?')[0], user: req.user?.sub })
    return res.status(500).json({ message: 'Server error', request_id: req.id })
  }
  return res.status(status).json({ message: error.message, ...(status >= 500 ? { request_id: req.id } : {}) })
}

// ------------------------------------------------------------------ scheduled jobs
const jobs = new Map() // name -> { name, every_hours, runs, failures, last_started, last_ok, last_failed, last_error, running }
const lastAlert = new Map()
let alertSender = null

/** server.js passes the function that alerts administrators (kept here to avoid import cycles). */
export function setAlertSender(fn) {
  alertSender = fn
}

function jobState(name, everyHours) {
  if (!jobs.has(name)) jobs.set(name, { name, every_hours: everyHours ?? null, runs: 0, failures: 0, last_started: null, last_ok: null, last_failed: null, last_error: null, running: false })
  return jobs.get(name)
}

export function registerJob(name, everyHours) {
  jobState(name, everyHours)
}

/** Marks a job as failed and alerts administrators (at most once every 6 hours per job). */
export async function jobFailed(name, error) {
  const job = jobState(name)
  job.failures += 1
  job.last_failed = new Date().toISOString()
  job.last_error = String(error?.message || error).slice(0, 300)
  captureError(error instanceof Error ? error : new Error(job.last_error), { kind: 'job', job: name })
  const last = lastAlert.get(name) || 0
  if (Date.now() - last < ALERT_EVERY_MS || !alertSender) return
  lastAlert.set(name, Date.now())
  try {
    await alertSender({ job: name, error: job.last_error })
  } catch {
    // Best effort.
  }
}

/** Runs a scheduled job, recording its outcome. Jobs that catch their own errors report them with jobFailed. */
export async function runJob(name, task, everyHours) {
  const job = jobState(name, everyHours)
  if (job.running) return
  job.running = true
  job.runs += 1
  job.last_started = new Date().toISOString()
  const failuresBefore = job.failures
  try {
    await task()
    if (job.failures === failuresBefore) job.last_ok = new Date().toISOString()
  } catch (error) {
    await jobFailed(name, error)
  } finally {
    job.running = false
  }
}

export const jobStatus = () => [...jobs.values()].map((job) => ({ ...job }))

/** Test helper. */
export function resetMonitor() {
  samples.length = 0
  recentErrors.length = 0
  jobs.clear()
  lastAlert.clear()
}

// ------------------------------------------------------------------ health
async function timed(promise, ms) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms) })])
  } finally {
    clearTimeout(timer)
  }
}

export async function databaseCheck() {
  const start = Date.now()
  try {
    await timed(query('SELECT 1'), 3000)
    return { ok: true, ms: Date.now() - start }
  } catch (error) {
    return { ok: false, ms: Date.now() - start, error: error.message === 'timeout' ? 'No answer within 3 seconds' : 'Unreachable' }
  }
}

async function diskCheck() {
  try {
    const stats = await statfs(config.uploadDir)
    const total = stats.blocks * stats.bsize
    const free = stats.bavail * stats.bsize
    return { ok: free / total > 0.1, free_bytes: free, total_bytes: total, free_percent: Math.round((free / total) * 1000) / 10 }
  } catch {
    return { ok: null, error: 'Storage folder not found' }
  }
}

async function backupCheck() {
  try {
    const { rows } = await query("SELECT max(created_at) AS at FROM audit_logs WHERE action = 'BACKUP_CREATED'")
    const at = rows[0]?.at || null
    const limitHours = (Number(config.jobs?.backupIntervalHours) || 24) * 2
    return { ok: Boolean(at) && Date.now() - new Date(at).getTime() < limitHours * 3600000, last_backup: at, expected_every_hours: limitHours / 2 }
  } catch {
    return { ok: null, last_backup: null }
  }
}

/** Full picture for the System health screen. */
export async function systemHealth() {
  const [database, disk, backups] = await Promise.all([databaseCheck(), diskCheck(), backupCheck()])
  const memory = process.memoryUsage()
  const requests = requestStats()
  const jobList = jobStatus()
  const failingJobs = jobList.filter((job) => job.last_failed && (!job.last_ok || job.last_failed > job.last_ok))
  const problems = []
  if (!database.ok) problems.push('database')
  if (disk.ok === false) problems.push('disk')
  if (backups.ok === false) problems.push('backups')
  if (requests.requests >= 20 && requests.error_rate > 5) problems.push('errors')
  if (failingJobs.length) problems.push('jobs')
  return {
    status: !database.ok ? 'down' : problems.length ? 'degraded' : 'ok',
    problems,
    version: process.env.APP_RELEASE || process.env.npm_package_version || null,
    started_at: new Date(STARTED_AT).toISOString(),
    uptime_seconds: Math.round((Date.now() - STARTED_AT) / 1000),
    node: process.version,
    host_load: os.loadavg()[0],
    memory_mb: { rss: Math.round(memory.rss / 1048576), heap_used: Math.round(memory.heapUsed / 1048576) },
    database,
    disk,
    backups,
    requests,
    jobs: jobList,
    recent_errors: recentErrors.slice(0, 20),
    error_reporting: sentryConfigured() ? 'sentry' : 'logs',
  }
}

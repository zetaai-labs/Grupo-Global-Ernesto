import fs from 'node:fs/promises'
import path from 'node:path'
import { createHmac, timingSafeEqual } from 'node:crypto'
import JSZip from 'jszip'
import { config } from '../config/env.js'

/**
 * SCORM 1.2 / SCORM 2004 / xAPI package handling:
 * safe extraction (no path traversal, no zip bombs), manifest reading and
 * signed launch tokens for the sandboxed content route.
 */

export const PACKAGE_ROOT = path.join(config.uploadDir, 'course-packages')
export const LIMITS = {
  zipBytes: Number(process.env.COURSE_PACKAGE_MAX_MB || 300) * 1024 * 1024,
  files: 5000,
  unzippedBytes: 1024 * 1024 * 1024,
  fileBytes: 300 * 1024 * 1024,
}

export class PackageError extends Error {}

export const packageDir = (packageId) => path.join(PACKAGE_ROOT, packageId)

/** Rejects absolute paths, drive letters, `..`, backslashes and control characters. */
export function safeEntryName(name) {
  if (typeof name !== 'string' || !name || name.length > 500) return null
  if (/[\u0000-\u001f\\]/.test(name) || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return null
  const parts = name.split('/').filter((part) => part !== '' && part !== '.')
  if (!parts.length || parts.some((part) => part === '..')) return null
  return parts.join('/')
}

// ---------------------------------------------------------------- tiny XML reader
// Manifests are small and regular; this reader handles elements, attributes and text.
function parseXml(xml) {
  const clean = String(xml)
    .replace(/^﻿/, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
  const root = { name: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const tag = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let match
  while ((match = tag.exec(clean))) {
    const [, cdata, closing, name, rawAttrs, selfClosing, text] = match
    const top = stack[stack.length - 1]
    if (cdata !== undefined) { top.text += cdata; continue }
    if (text !== undefined) { top.text += text; continue }
    if (closing) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const attrs = {}
    for (const a of rawAttrs.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3])
    const node = { name, attrs, children: [], text: '' }
    top.children.push(node)
    if (!selfClosing) stack.push(node)
  }
  return root
}

const decode = (value) => String(value)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const local = (name) => name.split(':').pop().toLowerCase()
const kids = (node, name) => node.children.filter((child) => local(child.name) === name)
const kid = (node, name) => kids(node, name)[0]
const textOf = (node) => (node ? decode(node.text).trim() : '')
function find(node, name) {
  if (local(node.name) === name) return node
  for (const child of node.children) {
    const hit = find(child, name)
    if (hit) return hit
  }
  return null
}
const attr = (node, name) => {
  if (!node) return undefined
  const key = Object.keys(node.attrs).find((k) => local(k) === name.toLowerCase())
  return key ? node.attrs[key] : undefined
}

/** Reads imsmanifest.xml: SCORM version, title, launch file and mastery score. */
export function parseScormManifest(xml) {
  const doc = parseXml(xml)
  const manifest = find(doc, 'manifest')
  if (!manifest) throw new PackageError('imsmanifest.xml has no <manifest> element.')
  const schemaVersion = textOf(find(manifest, 'schemaversion'))
  const is2004 = /2004|cam 1\.3|1\.3/i.test(schemaVersion) || /adlcp_v1p3|imscp_v1p1.*2004/i.test(JSON.stringify(manifest.attrs))
  const organizations = kid(manifest, 'organizations')
  const orgs = organizations ? kids(organizations, 'organization') : []
  const org = orgs.find((o) => attr(o, 'identifier') === attr(organizations, 'default')) || orgs[0]
  const resources = kid(manifest, 'resources')
  const resourceList = resources ? kids(resources, 'resource') : []

  // First item (depth-first) that points at a resource with a launch file.
  let launchItem = null
  const walk = (node) => {
    for (const item of kids(node, 'item')) {
      if (launchItem) return
      if (attr(item, 'identifierref')) {
        const res = resourceList.find((r) => attr(r, 'identifier') === attr(item, 'identifierref'))
        if (res && attr(res, 'href')) { launchItem = { item, res }; return }
      }
      walk(item)
    }
  }
  if (org) walk(org)
  const res = launchItem?.res || resourceList.find((r) => attr(r, 'href') && /sco/i.test(attr(r, 'scormtype') || attr(r, 'scormType') || ''))
    || resourceList.find((r) => attr(r, 'href'))
  if (!res) throw new PackageError('The manifest does not name a launch file.')

  const base = attr(resources, 'base') || ''
  const resBase = attr(res, 'base') || ''
  let launch = `${base}${resBase}${attr(res, 'href')}`
  const params = launchItem && attr(launchItem.item, 'parameters')
  if (params) launch += params.startsWith('?') || params.startsWith('#') ? params : `?${params}`

  const mastery = launchItem ? Number(textOf(kid(launchItem.item, 'masteryscore'))) : NaN
  return {
    standard: is2004 ? 'SCORM_2004' : 'SCORM_12',
    title: textOf(org && kid(org, 'title')) || null,
    launch,
    masteryScore: Number.isFinite(mastery) && mastery >= 0 && mastery <= 100 ? Math.round(mastery) : null,
  }
}

/** Reads tincan.xml (xAPI): activity id, title and launch file. */
export function parseTincan(xml) {
  const doc = parseXml(xml)
  const activities = find(doc, 'activities')
  const list = activities ? kids(activities, 'activity') : []
  const activity = list.find((a) => kid(a, 'launch')) || list[0]
  const launch = textOf(activity && kid(activity, 'launch'))
  if (!activity || !launch) throw new PackageError('tincan.xml does not name a launch file.')
  return { standard: 'XAPI', title: textOf(kid(activity, 'name')) || null, launch, activityId: attr(activity, 'id') || null, masteryScore: null }
}

/**
 * Extracts a package zip into `destination` and returns what it found.
 * The manifest may sit in a sub-folder; the launch path is made relative to the extraction root.
 */
export async function extractPackage(buffer, destination) {
  let zip
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: false })
  } catch {
    throw new PackageError('This file is not a valid zip archive.')
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith('__MACOSX/'))
  if (!entries.length) throw new PackageError('The archive is empty.')
  if (entries.length > LIMITS.files) throw new PackageError(`The archive has more than ${LIMITS.files} files.`)
  const declared = entries.reduce((sum, entry) => sum + Number(entry._data?.uncompressedSize || 0), 0)
  if (declared > LIMITS.unzippedBytes) throw new PackageError('The unpacked course is larger than 1 GB.')

  const names = new Map()
  for (const entry of entries) {
    const original = entry.unsafeOriginalName || entry.name
    const safe = safeEntryName(original) && safeEntryName(entry.name)
    if (!safe) throw new PackageError(`Unsafe file path in the archive: ${String(original).slice(0, 80)}`)
    if (entry.unixPermissions && (entry.unixPermissions & 0o170000) === 0o120000) throw new PackageError('Symbolic links are not allowed in course packages.')
    names.set(safe, entry)
  }

  const shallowest = (file) => [...names.keys()]
    .filter((name) => name.split('/').pop().toLowerCase() === file)
    .sort((a, b) => a.split('/').length - b.split('/').length)[0]
  const manifestName = shallowest('imsmanifest.xml')
  const tincanName = manifestName ? null : shallowest('tincan.xml')
  if (!manifestName && !tincanName) throw new PackageError('No imsmanifest.xml (SCORM) or tincan.xml (xAPI) found in the archive.')

  const descriptor = manifestName
    ? parseScormManifest(await names.get(manifestName).async('string'))
    : parseTincan(await names.get(tincanName).async('string'))
  const prefix = path.posix.dirname(manifestName || tincanName)
  const launchFile = (prefix === '.' ? '' : `${prefix}/`) + descriptor.launch
  const launchPath = safeEntryName(launchFile.split(/[?#]/)[0])
  if (!launchPath || !names.has(launchPath)) throw new PackageError(`The launch file ${descriptor.launch} is not in the archive.`)

  await fs.rm(destination, { recursive: true, force: true })
  await fs.mkdir(destination, { recursive: true })
  let total = 0
  for (const [name, entry] of names) {
    const target = path.join(destination, ...name.split('/'))
    if (!target.startsWith(destination + path.sep)) throw new PackageError('Unsafe file path in the archive.')
    const data = await entry.async('nodebuffer')
    if (data.length > LIMITS.fileBytes) throw new PackageError('A file in the archive is larger than 300 MB.')
    total += data.length
    if (total > LIMITS.unzippedBytes) throw new PackageError('The unpacked course is larger than 1 GB.')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data)
  }
  const query = launchFile.slice(launchPath.length)
  return { ...descriptor, launchPath: launchPath + query, fileCount: names.size, totalBytes: total }
}

// ---------------------------------------------------------------- launch tokens
// A separate key from login tokens, so a content token can never be used to sign in.
const tokenKey = () => createHmac('sha256', config.jwtSecret).update('gg-course-content-v1').digest()
const b64 = (value) => Buffer.from(value).toString('base64url')

export function signContentToken({ attemptId, packageId, userId }, ttlSeconds = 6 * 3600) {
  const payload = b64(JSON.stringify({ a: attemptId, p: packageId, u: userId, e: Math.floor(Date.now() / 1000) + ttlSeconds }))
  const mac = createHmac('sha256', tokenKey()).update(payload).digest('base64url')
  return `${payload}.${mac}`
}

export function verifyContentToken(token) {
  if (typeof token !== 'string' || token.length > 600) return null
  const [payload, mac] = token.split('.')
  if (!payload || !mac) return null
  const expected = createHmac('sha256', tokenKey()).update(payload).digest()
  const given = Buffer.from(mac, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data.e || data.e < Date.now() / 1000) return null
    return { attemptId: data.a, packageId: data.p, userId: data.u }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- runtime helpers
/** SCORM 1.2 "HH:MM:SS.ss" or SCORM 2004 / xAPI "PT1H2M3.5S" to seconds. */
export function durationSeconds(value) {
  if (typeof value !== 'string') return 0
  const hms = value.match(/^(\d{1,4}):(\d{1,2}):(\d{1,2})(\.\d+)?$/)
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
  const iso = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/)
  if (iso) return Math.round(Number(iso[1] || 0) * 86400 + Number(iso[2] || 0) * 3600 + Number(iso[3] || 0) * 60 + Number(iso[4] || 0))
  return 0
}

const clampScore = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null)

/** Score in percent from SCORM data, or null when the package reported none. */
export function scormScore(standard, cmi) {
  if (standard === 'SCORM_2004') {
    const scaled = Number(cmi['cmi.score.scaled'])
    if (cmi['cmi.score.scaled'] !== undefined && cmi['cmi.score.scaled'] !== '' && Number.isFinite(scaled)) return clampScore(scaled * 100)
    return rawScore(cmi['cmi.score.raw'], cmi['cmi.score.min'], cmi['cmi.score.max'])
  }
  return rawScore(cmi['cmi.core.score.raw'], cmi['cmi.core.score.min'], cmi['cmi.core.score.max'])
}

function rawScore(raw, min, max) {
  if (raw === undefined || raw === '') return null
  const r = Number(raw)
  if (!Number.isFinite(r)) return null
  const lo = min === undefined || min === '' ? 0 : Number(min)
  const hi = max === undefined || max === '' ? 100 : Number(max)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return clampScore(r)
  return clampScore(((r - lo) / (hi - lo)) * 100)
}

/**
 * Outcome of a SCORM attempt: 'passed', 'failed' or null (still in progress).
 * "completed" without a pass/fail counts as passed when the score (if any) reaches the pass mark.
 */
export function scormOutcome(standard, cmi, passMark) {
  const score = scormScore(standard, cmi)
  const meetsMark = score === null || score >= passMark
  if (standard === 'SCORM_2004') {
    const success = cmi['cmi.success_status']
    const completion = cmi['cmi.completion_status']
    if (success === 'passed') return 'passed'
    if (success === 'failed') return 'failed'
    if (completion === 'completed') return meetsMark ? 'passed' : 'failed'
    return null
  }
  const status = cmi['cmi.core.lesson_status']
  if (status === 'passed') return 'passed'
  if (status === 'failed') return 'failed'
  if (status === 'completed') return meetsMark ? 'passed' : 'failed'
  return null
}

export const statusOf = (standard, cmi) => (standard === 'SCORM_2004'
  ? cmi['cmi.success_status'] && cmi['cmi.success_status'] !== 'unknown' ? cmi['cmi.success_status'] : cmi['cmi.completion_status'] || 'not attempted'
  : cmi['cmi.core.lesson_status'] || 'not attempted')

/** Keeps only well-formed cmi.* keys with string values, within size limits. */
export function cleanCmi(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const out = {}
  let size = 0
  for (const [key, raw] of Object.entries(input)) {
    if (!/^cmi\.[A-Za-z0-9_.]{1,200}$/.test(key)) continue
    if (/\._(count|children|version)$/.test(key)) continue
    const value = raw === null || raw === undefined ? '' : String(raw)
    if (value.length > 65536) return null
    size += key.length + value.length
    if (size > 1024 * 1024) return null
    out[key] = value
  }
  return out
}

/**
 * Removes package folders that no longer belong to a course (and interrupted uploads).
 * `knownIds` is the set of package_id values still in course_packages.
 */
export async function sweepOrphanPackages(knownIds) {
  let entries = []
  try {
    entries = await fs.readdir(PACKAGE_ROOT, { withFileTypes: true })
  } catch {
    return 0
  }
  let removed = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const id = entry.name.split('.staging-')[0]
    const stagedAt = Number(entry.name.split('.staging-')[1])
    const staleStaging = entry.name.includes('.staging-') && Date.now() - stagedAt > 60 * 60 * 1000
    if (entry.name.includes('.staging-') ? staleStaging : !knownIds.has(id)) {
      await fs.rm(path.join(PACKAGE_ROOT, entry.name), { recursive: true, force: true })
      removed += 1
    }
  }
  return removed
}

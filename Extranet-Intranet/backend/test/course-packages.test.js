import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import JSZip from 'jszip'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import {
  parseScormManifest, parseTincan, safeEntryName, sweepOrphanPackages, scormOutcome, scormScore, durationSeconds, signContentToken, verifyContentToken,
} from '../src/services/coursePackage.service.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

const SCORM12_MANIFEST = `<?xml version="1.0"?>
<manifest identifier="demo" version="1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG">
    <organization identifier="ORG"><title>Safety basics</title>
      <item identifier="I1" identifierref="R1"><title>Lesson 1</title><adlcp:masteryscore>80</adlcp:masteryscore></item>
    </organization>
  </organizations>
  <resources><resource identifier="R1" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources>
</manifest>`

const SCORM2004_MANIFEST = `<manifest identifier="m" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="o1"><organization identifier="o1"><title>Ethics 2004</title>
    <item identifier="i0"><title>Module</title><item identifier="i1" identifierref="r1" parameters="?lang=es"><title>Part 1</title></item></item>
  </organization></organizations>
  <resources><resource identifier="r1" type="webcontent" adlcp:scormType="sco" xml:base="content/" href="start.html"/></resources>
</manifest>`

const TINCAN = `<?xml version="1.0" encoding="utf-8"?>
<tincan xmlns="http://projecttincan.com/tincan.xsd"><activities>
  <activity id="https://grupoglobal.example/courses/gdpr" type="http://adlnet.gov/expapi/activities/course">
    <name>GDPR essentials</name><launch lang="en-us">story.html</launch>
  </activity>
</activities></tincan>`

async function zipOf(files) {
  const zip = new JSZip()
  for (const [name, body] of Object.entries(files)) zip.file(name, body)
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('course packages: parsing and helpers', () => {
  it('reads SCORM 1.2, SCORM 2004 and xAPI descriptors', () => {
    const v12 = parseScormManifest(SCORM12_MANIFEST)
    assert.deepEqual(v12, { standard: 'SCORM_12', title: 'Safety basics', launch: 'index.html', masteryScore: 80 })
    const v2004 = parseScormManifest(SCORM2004_MANIFEST)
    assert.equal(v2004.standard, 'SCORM_2004')
    assert.equal(v2004.launch, 'content/start.html?lang=es')
    const xapi = parseTincan(TINCAN)
    assert.equal(xapi.activityId, 'https://grupoglobal.example/courses/gdpr')
    assert.equal(xapi.launch, 'story.html')
  })

  it('rejects unsafe paths and works out results', () => {
    for (const bad of ['../etc/passwd', '/abs.html', 'C:/x.html', 'a/../../b', 'a\\b']) assert.equal(safeEntryName(bad), null, bad)
    assert.equal(safeEntryName('./a//b.html'), 'a/b.html')
    assert.equal(scormOutcome('SCORM_12', { 'cmi.core.lesson_status': 'completed', 'cmi.core.score.raw': '60' }, 70), 'failed')
    assert.equal(scormOutcome('SCORM_12', { 'cmi.core.lesson_status': 'completed' }, 70), 'passed')
    assert.equal(scormOutcome('SCORM_2004', { 'cmi.success_status': 'passed' }, 70), 'passed')
    assert.equal(scormOutcome('SCORM_2004', { 'cmi.completion_status': 'incomplete' }, 70), null)
    assert.equal(scormScore('SCORM_2004', { 'cmi.score.scaled': '0.85' }), 85)
    assert.equal(scormScore('SCORM_12', { 'cmi.core.score.raw': '8', 'cmi.core.score.max': '10' }), 80)
    assert.equal(durationSeconds('01:02:03.5'), 3723)
    assert.equal(durationSeconds('PT1H2M3S'), 3723)
  })

  it('signs content tokens that cannot be altered', () => {
    const token = signContentToken({ attemptId: 'a', packageId: 'p', userId: 7 })
    assert.deepEqual(verifyContentToken(token), { attemptId: 'a', packageId: 'p', userId: 7 })
    const [payload, mac] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ a: 'a', p: 'p', u: 1, e: 9999999999 })).toString('base64url')
    assert.equal(verifyContentToken(`${forged}.${mac}`), null)
    assert.equal(verifyContentToken(`${payload}.x${mac}`), null)
    assert.equal(verifyContentToken(signContentToken({ attemptId: 'a', packageId: 'p', userId: 7 }, -10)), null)
  })
})

describe('course packages: upload, play and certify', () => {
  let hr
  let employee
  let courseId
  let xapiCourseId

  before(async () => {
    hr = await loginAs('hr@gmail.com')
    employee = await loginAs('employee@gmail.com')
    const create = async (title) => (await request(app).post('/api/courses').set(auth(hr)).send({ module_type: 'COMPLIANCE_COURSE', title, pass_mark: 70 })).body.data.item_id
    courseId = await create(`SCORM test ${Date.now()}`)
    xapiCourseId = await create(`xAPI test ${Date.now()}`)
  })

  after(async () => {
    await query('DELETE FROM community_events_courses WHERE item_id = ANY($1::uuid[])', [[courseId, xapiCourseId]])
    const { rows } = await query('SELECT package_id FROM course_packages')
    await sweepOrphanPackages(new Set(rows.map((row) => row.package_id)))
  })

  it('only authors can upload, and unsafe archives are refused', async () => {
    const good = await zipOf({ 'imsmanifest.xml': SCORM12_MANIFEST, 'index.html': '<html><head><title>x</title></head><body>Lesson</body></html>' })
    const denied = await request(app).post(`/api/courses/${courseId}/package`).set(auth(employee)).attach('file', good, 'course.zip')
    assert.equal(denied.status, 403)

    const traversal = new JSZip()
    traversal.file('imsmanifest.xml', SCORM12_MANIFEST)
    traversal.file('index.html', 'x')
    traversal.file('../../evil.js', 'alert(1)')
    const evil = await traversal.generateAsync({ type: 'nodebuffer' })
    const refused = await request(app).post(`/api/courses/${courseId}/package`).set(auth(hr)).attach('file', evil, 'evil.zip')
    assert.equal(refused.status, 400)
    assert.match(refused.body.message, /Unsafe file path/)

    const noManifest = await request(app).post(`/api/courses/${courseId}/package`).set(auth(hr)).attach('file', await zipOf({ 'index.html': 'x' }), 'plain.zip')
    assert.equal(noManifest.status, 400)

    const notZip = await request(app).post(`/api/courses/${courseId}/package`).set(auth(hr)).attach('file', Buffer.from('hello'), 'fake.zip')
    assert.equal(notZip.status, 400)
  })

  it('plays a SCORM 1.2 course in a sandbox and issues the certificate on a pass', async () => {
    const pkg = await zipOf({ 'course/imsmanifest.xml': SCORM12_MANIFEST, 'course/index.html': '<html><head><title>x</title></head><body>Lesson</body></html>', 'course/app.js': 'console.log(1)' })
    const upload = await request(app).post(`/api/courses/${courseId}/package`).set(auth(hr)).attach('file', pkg, 'safety.zip')
    assert.equal(upload.status, 201, JSON.stringify(upload.body))
    assert.equal(upload.body.data.standard, 'SCORM_12')

    const launch = await request(app).post(`/api/courses/${courseId}/package/launch`).set(auth(employee)).send({ origin: 'http://localhost:5196' })
    assert.equal(launch.status, 200)
    const { url, token } = launch.body.data
    assert.match(url, /^\/api\/course-content\/[^/]+\/course\/index\.html$/)

    const page = await request(app).get(url)
    assert.equal(page.status, 200)
    assert.match(page.headers['content-security-policy'], /^sandbox allow-scripts/)
    assert.doesNotMatch(page.headers['content-security-policy'], /allow-same-origin/)
    assert.match(page.text, /window\.API=/)
    assert.match(page.text, /"cmi\.core\.student_name":"Wade Warren"/)
    assert.equal((await request(app).get(url.replace('index.html', 'app.js'))).status, 200)
    assert.equal((await request(app).get(url.replace('course/index.html', '..%2F..%2Fpackage.json'))).status, 404)
    assert.equal((await request(app).get(url.replace(token, `${token}x`))).status, 403)

    // Another user cannot save into this attempt.
    const manager = await loginAs('manager@gmail.com')
    const stolen = await request(app).post(`/api/courses/${courseId}/package/runtime`).set(auth(manager)).send({ token, cmi: { 'cmi.core.lesson_status': 'passed' } })
    assert.equal(stolen.status, 403)

    const progress = await request(app).post(`/api/courses/${courseId}/package/runtime`).set(auth(employee))
      .send({ token, cmi: { 'cmi.core.lesson_status': 'incomplete', 'cmi.core.lesson_location': 'page-3', 'cmi.suspend_data': 'abc' } })
    assert.equal(progress.status, 200)
    assert.equal(progress.body.data.outcome, null)

    const resumed = await request(app).get(url)
    assert.match(resumed.text, /"cmi\.core\.entry":"resume"/)
    assert.match(resumed.text, /"cmi\.core\.lesson_location":"page-3"/)

    // Below the mastery score (80) is a fail.
    const low = await request(app).post(`/api/courses/${courseId}/package/runtime`).set(auth(employee))
      .send({ token, finished: true, cmi: { 'cmi.core.lesson_status': 'completed', 'cmi.core.score.raw': '75', 'cmi.core.session_time': '00:10:00' } })
    assert.equal(low.body.data.outcome, 'failed')

    const pass = await request(app).post(`/api/courses/${courseId}/package/runtime`).set(auth(employee))
      .send({ token, finished: true, cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '92', 'cmi.core.session_time': '00:05:00' } })
    assert.equal(pass.status, 200)
    assert.equal(pass.body.data.outcome, 'passed')
    assert.match(pass.body.data.certificate_hash, /^[0-9a-f]{64}$/)

    const verify = await request(app).get(`/api/public/certificates/${pass.body.data.certificate_hash}`)
    assert.equal(verify.body.data.valid, true)
    assert.equal(verify.body.data.score, 92)

    const detail = await request(app).get(`/api/courses/${courseId}`).set(auth(employee))
    assert.equal(detail.body.data.package.standard, 'SCORM_12')
    assert.equal(detail.body.data.package.total_seconds, 900)
    assert.equal(detail.body.data.enrollment.status, 'COMPLETED')
  })

  it('accepts xAPI statements and completes the course on "passed"', async () => {
    const pkg = await zipOf({ 'tincan.xml': TINCAN, 'story.html': '<html><body>Story</body></html>' })
    assert.equal((await request(app).post(`/api/courses/${xapiCourseId}/package`).set(auth(hr)).attach('file', pkg, 'gdpr.zip')).status, 201)

    const launch = await request(app).post(`/api/courses/${xapiCourseId}/package/launch`).set(auth(employee)).send({ origin: 'http://localhost:5196' })
    const url = new URL(launch.body.data.url, 'http://localhost:5196')
    assert.equal(url.pathname.endsWith('/story.html'), true)
    const endpoint = new URL(url.searchParams.get('endpoint'))
    assert.equal(JSON.parse(url.searchParams.get('actor')).account.name.length, 36)

    const preflight = await request(app).options(`${endpoint.pathname}statements`).set('Origin', 'null')
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers['access-control-allow-origin'], '*')

    const about = await request(app).get(`${endpoint.pathname}about`)
    assert.ok(about.body.version.includes('1.0.3'))

    const statement = {
      actor: JSON.parse(url.searchParams.get('actor')),
      verb: { id: 'http://adlnet.gov/expapi/verbs/passed' },
      object: { id: 'https://grupoglobal.example/courses/gdpr' },
      result: { score: { scaled: 0.9 }, success: true },
    }
    const posted = await request(app).post(`${endpoint.pathname}statements`).set('Content-Type', 'application/json').set('Origin', 'null').send(JSON.stringify(statement))
    assert.equal(posted.status, 200, JSON.stringify(posted.body))
    assert.equal(posted.body.length, 1)

    const state = `${endpoint.pathname}activities/state?activityId=${encodeURIComponent('https://grupoglobal.example/courses/gdpr')}&stateId=bookmark`
    assert.equal((await request(app).put(state).set('Content-Type', 'application/json').send('{"slide":4}')).status, 204)
    assert.equal((await request(app).get(state)).text, '{"slide":4}')

    const detail = await request(app).get(`/api/courses/${xapiCourseId}`).set(auth(employee))
    assert.equal(detail.body.data.enrollment.status, 'COMPLETED')
    assert.equal(detail.body.data.enrollment.best_score, 90)

    assert.equal((await request(app).delete(`/api/courses/${xapiCourseId}/package`).set(auth(hr))).status, 200)
    assert.equal((await request(app).get(launch.body.data.url)).status, 403)
  })
})

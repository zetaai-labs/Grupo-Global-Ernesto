import { z } from 'zod'
import { query } from '../config/database.js'
import { config } from '../config/env.js'
import { writeAudit } from '../services/audit.js'
import { signPlayback } from '../services/streaming.service.js'
import { MAX_SECONDS, providers, uploadProvider } from '../integrations/video/streamUpload.js'

/**
 * Video bios (Technical Spec §1.2 Module 1): one short presentation video per person.
 * The browser uploads straight to Mux / Cloudflare Stream; the provider transcodes to HLS
 * and generates captions, which become a searchable transcript.
 */

const fail = (res, status, message) => res.status(status).json({ message })
const LANGUAGES = ['es', 'en', 'ar', 'ru', 'fr', 'de', 'it', 'pt', 'hi']
const REFRESH_EVERY_MS = 10000

const present = (bio) => bio && ({
  status: bio.status,
  failure: bio.failure,
  language: bio.language,
  duration_seconds: bio.duration_seconds === null ? null : Number(bio.duration_seconds),
  transcript: bio.transcript,
  transcript_status: bio.transcript_status,
  updated_at: bio.updated_at,
})

const allowedOrigins = () => String(config.frontendOrigin || '').split(',').map((value) => value.trim()).filter(Boolean)

/** Saves what the provider reported; rejects videos over the length limit. */
async function applyRefresh(bio) {
  const provider = providers[bio.provider]
  if (!provider || uploadProvider() !== bio.provider) return bio
  if (bio.status === 'FAILED' || (bio.status === 'READY' && bio.transcript_status !== 'PENDING')) return bio
  let changes = await provider.refresh(bio)
  if (changes.status === 'READY' && Number(changes.duration_seconds) > MAX_SECONDS + 5) {
    await provider.remove({ ...bio, ...changes }).catch(() => {})
    changes = { status: 'FAILED', failure: 'The video is longer than 5 minutes. Upload a shorter one.', asset_id: null, playback_id: null, transcript_status: 'NONE' }
  }
  const columns = ['asset_id', 'playback_id', 'status', 'failure', 'duration_seconds', 'transcript', 'transcript_status'].filter((key) => key in changes)
  if (!columns.length) {
    await query('UPDATE video_bios SET updated_at = now() WHERE id = $1', [bio.id])
    return { ...bio, updated_at: new Date() }
  }
  const { rows } = await query(
    `UPDATE video_bios SET ${columns.map((key, index) => `${key} = $${index + 2}`).join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
    [bio.id, ...columns.map((key) => changes[key] ?? null)],
  )
  if (rows[0]?.status === 'READY' && bio.status !== 'READY') await writeAudit(bio.user_id, 'VIDEO_BIO_READY', 'video_bios', bio.id)
  return rows[0] || bio
}

const loadBio = async (userId) => (await query('SELECT * FROM video_bios WHERE user_id = $1', [userId])).rows[0] || null

/** GET /community/me/video-bio — my video and transcript; follows processing while it runs. */
export async function myVideoBio(req, res) {
  let bio = await loadBio(req.user.sub)
  if (bio && Date.now() - new Date(bio.updated_at).getTime() >= REFRESH_EVERY_MS) {
    bio = await applyRefresh(bio).catch(() => bio)
  }
  return res.json({ data: present(bio), meta: { enabled: Boolean(uploadProvider()), max_seconds: MAX_SECONDS, languages: LANGUAGES } })
}

const uploadSchema = z.object({ language: z.enum(LANGUAGES).default('es') })

/** POST /community/me/video-bio/upload — creates a one-time direct upload URL for the browser. */
export async function createVideoUpload(req, res) {
  const provider = uploadProvider()
  if (!provider) return fail(res, 503, 'Video uploads are not set up yet. Paste a video link instead.')
  const parsed = uploadSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, 'Choose the language spoken in the video.')
  const recent = await query(
    "SELECT COUNT(*)::int AS n FROM audit_logs WHERE user_id = $1 AND action = 'VIDEO_BIO_UPLOAD_STARTED' AND created_at > now() - interval '1 day'",
    [req.user.sub],
  ).catch(() => ({ rows: [{ n: 0 }] }))
  const dailyLimit = Math.max(1, Number(process.env.VIDEO_BIO_DAILY_LIMIT) || 10)
  if (recent.rows[0].n >= dailyLimit) return fail(res, 429, 'Too many uploads today. Try again tomorrow.')

  const previous = await loadBio(req.user.sub)
  const origin = allowedOrigins().includes(req.get('origin')) ? req.get('origin') : allowedOrigins()[0]
  const upload = await providers[provider].createUpload({ origin, language: parsed.data.language, userUuid: String(req.user.sub) })
  if (previous) await providers[previous.provider]?.remove(previous).catch(() => {})
  const { rows } = await query(
    `INSERT INTO video_bios (id, user_id, provider, upload_id, asset_id, language)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET provider = EXCLUDED.provider, upload_id = EXCLUDED.upload_id, asset_id = EXCLUDED.asset_id,
       playback_id = NULL, status = 'WAITING_UPLOAD', failure = NULL, language = EXCLUDED.language, duration_seconds = NULL,
       transcript = NULL, transcript_status = 'PENDING', updated_at = now()
     RETURNING *`,
    [req.user.sub, provider, upload.uploadId, upload.assetId || null, parsed.data.language],
  )
  await query('UPDATE users SET video_bio_url = NULL WHERE id = $1', [req.user.sub])
  await writeAudit(req.user.sub, 'VIDEO_BIO_UPLOAD_STARTED', 'video_bios', rows[0].id)
  return res.status(201).json({ data: { upload_url: upload.uploadUrl, method: upload.method, field: provider === 'cloudflare' ? 'file' : null, max_seconds: MAX_SECONDS, bio: present(rows[0]) } })
}

/** DELETE /community/me/video-bio — removes the video at the provider and the transcript. */
export async function deleteVideoBio(req, res) {
  const bio = await loadBio(req.user.sub)
  if (bio) {
    await providers[bio.provider]?.remove(bio).catch(() => {})
    await query('DELETE FROM video_bios WHERE id = $1', [bio.id])
  }
  await query('UPDATE users SET video_bio_url = NULL WHERE id = $1', [req.user.sub])
  await writeAudit(req.user.sub, 'VIDEO_BIO_DELETED', 'video_bios', bio?.id || null)
  return res.json({ message: 'Video bio removed.' })
}

/** GET /community/video-bios/:userId — signed, expiring playback for intranet staff. */
export async function playVideoBio(req, res) {
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId < 1) return fail(res, 400, 'Invalid person.')
  const { rows } = await query(
    `SELECT b.*, u.name FROM video_bios b JOIN users u ON u.id = b.user_id
     WHERE b.user_id = $1 AND u.status = 'active' AND NOT u.processing_opposed`,
    [userId],
  )
  const bio = rows[0]
  if (!bio || bio.status !== 'READY' || !bio.playback_id) return fail(res, 404, 'This person has no video bio yet.')
  const playback = signPlayback({ videoId: bio.playback_id, ttlSeconds: 3600 })
  if (!playback) return fail(res, 503, 'Video playback is not set up yet.')
  const { token: _token, ...urls } = playback
  return res.json({ data: { name: bio.name, ...urls, language: bio.language, duration_seconds: Number(bio.duration_seconds), transcript: bio.transcript } })
}

/** Provider webhooks: verify the signature, then advance the matching bio. */
function webhook(providerName) {
  return async (req, res) => {
    const provider = providers[providerName]
    const header = providerName === 'mux' ? req.get('mux-signature') : req.get('webhook-signature')
    if (!provider.verify(req.rawBody, header)) return fail(res, 401, 'Invalid signature.')
    const body = req.body || {}
    const ids = providerName === 'mux'
      ? [body.data?.id, body.data?.upload_id, body.data?.asset_id, body.object?.id].filter(Boolean)
      : [body.uid].filter(Boolean)
    if (ids.length) {
      const { rows } = await query(
        'SELECT * FROM video_bios WHERE provider = $1 AND (upload_id = ANY($2::text[]) OR asset_id = ANY($2::text[]))',
        [providerName, ids],
      )
      for (const bio of rows) await applyRefresh(bio).catch(() => {})
    }
    return res.json({ received: true })
  }
}

export const muxWebhook = webhook('mux')
export const cloudflareStreamWebhook = webhook('cloudflare')

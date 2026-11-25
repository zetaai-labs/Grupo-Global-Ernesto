import { createHmac, timingSafeEqual } from 'node:crypto'
import { signPlayback, streamingProvider } from '../../services/streaming.service.js'

/**
 * Direct uploads and automatic captions for Mux and Cloudflare Stream.
 * The browser sends the file straight to the provider; the server only creates the upload,
 * follows processing and reads the generated transcript.
 *
 * Mux:        MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SECRET (+ signing keys for playback)
 * Cloudflare: CF_ACCOUNT_ID, CF_STREAM_API_TOKEN, CF_STREAM_WEBHOOK_SECRET (+ signing keys)
 */

export const MAX_SECONDS = 300
const TIMEOUT_MS = 20000
const fail = (status, message) => Object.assign(new Error(message), { status })

export function uploadProvider() {
  const provider = streamingProvider()
  if (provider === 'mux' && process.env.MUX_TOKEN_ID?.trim() && process.env.MUX_TOKEN_SECRET?.trim()) return 'mux'
  if (provider === 'cloudflare' && /^[a-f0-9]{32}$/.test(process.env.CF_ACCOUNT_ID?.trim() || '') && process.env.CF_STREAM_API_TOKEN?.trim()) return 'cloudflare'
  return null
}

async function call(url, options, what) {
  let response
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw fail(502, 'The video service could not be reached. Try again later.')
  }
  if (response.status === 404 && options.method === 'DELETE') return null
  const text = await response.text()
  if (!response.ok) throw fail(502, `The video service refused the request (${what}).`)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// ---------------------------------------------------------------- Mux
const MUX = 'https://api.mux.com/video/v1'
const muxHeaders = () => ({
  Authorization: `Basic ${Buffer.from(`${process.env.MUX_TOKEN_ID.trim()}:${process.env.MUX_TOKEN_SECRET.trim()}`).toString('base64')}`,
  'Content-Type': 'application/json',
})

const mux = {
  async createUpload({ origin, language }) {
    const json = await call(`${MUX}/uploads`, {
      method: 'POST',
      headers: muxHeaders(),
      body: JSON.stringify({
        cors_origin: origin,
        new_asset_settings: {
          playback_policies: ['signed'],
          video_quality: 'basic',
          inputs: [{ generated_subtitles: [{ language_code: language, name: `${language.toUpperCase()} (auto)` }] }],
        },
      }),
    }, 'upload')
    return { uploadId: json.data.id, uploadUrl: json.data.url, method: 'PUT' }
  },

  /** Advances one bio and returns the fields to save. */
  async refresh(bio) {
    let assetId = bio.asset_id
    if (!assetId && bio.upload_id) {
      const upload = await call(`${MUX}/uploads/${encodeURIComponent(bio.upload_id)}`, { method: 'GET', headers: muxHeaders() }, 'upload status')
      if (upload.data.status === 'errored' || upload.data.status === 'timed_out' || upload.data.status === 'cancelled') return { status: 'FAILED', failure: 'The upload did not finish. Try again.' }
      assetId = upload.data.asset_id || null
      if (!assetId) return {}
    }
    const asset = (await call(`${MUX}/assets/${encodeURIComponent(assetId)}`, { method: 'GET', headers: muxHeaders() }, 'asset')).data
    if (asset.status === 'errored') return { asset_id: assetId, status: 'FAILED', failure: 'The video could not be processed. Try another file.' }
    if (asset.status !== 'ready') return { asset_id: assetId, status: 'PROCESSING' }
    const playbackId = (asset.playback_ids || []).find((p) => p.policy === 'signed')?.id || asset.playback_ids?.[0]?.id
    const out = { asset_id: assetId, playback_id: playbackId, duration_seconds: asset.duration, status: 'READY' }
    const track = (asset.tracks || []).find((t) => t.type === 'text' && t.text_source === 'generated_vod')
    if (!track) out.transcript_status = bio.transcript_status === 'READY' ? 'READY' : 'PENDING'
    else if (track.status === 'ready' && bio.transcript_status !== 'READY') {
      const signed = signPlayback({ videoId: playbackId, audience: 't' })
      const url = `https://stream.mux.com/${playbackId}/text/${track.id}.vtt${signed?.token ? `?token=${signed.token}` : ''}`
      out.transcript = vttToText(await call(url, { method: 'GET' }, 'transcript'))
      out.transcript_status = 'READY'
    } else if (track.status === 'errored') out.transcript_status = 'NONE'
    return out
  },

  async remove(bio) {
    if (bio.asset_id) await call(`${MUX}/assets/${encodeURIComponent(bio.asset_id)}`, { method: 'DELETE', headers: muxHeaders() }, 'delete')
  },

  /** Mux-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">. */
  verify(rawBody, header) {
    return verifyHmac(rawBody, header, process.env.MUX_WEBHOOK_SECRET, 't', 'v1')
  },
}

// ---------------------------------------------------------------- Cloudflare Stream
const cfBase = () => `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID.trim()}/stream`
const cfHeaders = () => ({ Authorization: `Bearer ${process.env.CF_STREAM_API_TOKEN.trim()}`, 'Content-Type': 'application/json' })

const cloudflare = {
  async createUpload({ language, userUuid }) {
    const json = await call(`${cfBase()}/direct_upload`, {
      method: 'POST',
      headers: cfHeaders(),
      body: JSON.stringify({ maxDurationSeconds: MAX_SECONDS, requireSignedURLs: true, meta: { purpose: 'video-bio', language, user: userUuid } }),
    }, 'upload')
    return { uploadId: json.result.uid, uploadUrl: json.result.uploadURL, method: 'POST', assetId: json.result.uid }
  },

  async refresh(bio) {
    const video = (await call(`${cfBase()}/${encodeURIComponent(bio.asset_id)}`, { method: 'GET', headers: cfHeaders() }, 'video')).result
    const state = video.status?.state
    if (state === 'error') return { status: 'FAILED', failure: 'The video could not be processed. Try another file.' }
    if (!video.readyToStream) return { status: state === 'pendingupload' ? 'WAITING_UPLOAD' : 'PROCESSING' }
    const out = { playback_id: video.uid, duration_seconds: video.duration, status: 'READY' }
    if (bio.transcript_status === 'READY') return out
    const captions = (await call(`${cfBase()}/${encodeURIComponent(video.uid)}/captions`, { method: 'GET', headers: cfHeaders() }, 'captions')).result || []
    const caption = captions.find((c) => c.language === bio.language)
    if (!caption) {
      await call(`${cfBase()}/${encodeURIComponent(video.uid)}/captions/${bio.language}/generate`, { method: 'POST', headers: cfHeaders() }, 'generate captions')
      out.transcript_status = 'PENDING'
    } else if (caption.status === 'ready') {
      const vtt = await call(`${cfBase()}/${encodeURIComponent(video.uid)}/captions/${bio.language}/vtt`, { method: 'GET', headers: { Authorization: cfHeaders().Authorization } }, 'transcript')
      out.transcript = vttToText(vtt)
      out.transcript_status = 'READY'
    } else if (caption.status === 'error') out.transcript_status = 'NONE'
    return out
  },

  async remove(bio) {
    if (bio.asset_id) await call(`${cfBase()}/${encodeURIComponent(bio.asset_id)}`, { method: 'DELETE', headers: cfHeaders() }, 'delete')
  },

  /** Webhook-Signature: time=<unix>,sig1=<hex HMAC-SHA256 of "time.body">. */
  verify(rawBody, header) {
    return verifyHmac(rawBody, header, process.env.CF_STREAM_WEBHOOK_SECRET, 'time', 'sig1')
  },
}

export const providers = { mux, cloudflare }

function verifyHmac(rawBody, header, secret, timeKey, sigKey, now = Date.now()) {
  if (!secret?.trim() || !rawBody || !header) return false
  const parts = Object.fromEntries(String(header).split(',').map((part) => part.trim().split('=')))
  const time = Number(parts[timeKey])
  if (!Number.isFinite(time) || Math.abs(now / 1000 - time) > 300 || !parts[sigKey]) return false
  const expected = createHmac('sha256', secret.trim()).update(`${time}.${rawBody}`).digest()
  const given = Buffer.from(parts[sigKey], 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** WebVTT captions to plain transcript text (one paragraph, no timings or tags). */
export function vttToText(vtt) {
  return String(vtt || '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line && !/^WEBVTT/.test(line) && !/-->/.test(line) && !/^\d+$/.test(line.trim()) && !/^(NOTE|STYLE|REGION)\b/.test(line))
    .map((line) => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000)
}

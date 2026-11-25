import jwt from 'jsonwebtoken'

/**
 * Signed HLS/DASH playback (Technical Spec §1.2 Module 2).
 * STREAMING_PROVIDER: "mux" or "cloudflare". Off (returns null) until fully configured.
 * Callers must authorise the viewer BEFORE requesting a playback URL.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{6,128}$/
const CUSTOMER_CODE = /^[a-z0-9]{6,64}$/

/** Keys may be stored as PEM or as base64-encoded PEM (how both providers issue them). */
function readPrivateKey(value) {
  const raw = String(value || '').trim().replace(/\\n/g, '\n')
  if (!raw) return ''
  return raw.includes('BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8')
}

export function streamingProvider() {
  const provider = String(process.env.STREAMING_PROVIDER || '').trim().toLowerCase()
  if (provider === 'mux' && process.env.MUX_SIGNING_KEY_ID && process.env.MUX_SIGNING_PRIVATE_KEY) return 'mux'
  if (
    provider === 'cloudflare'
    && process.env.CF_STREAM_KEY_ID
    && process.env.CF_STREAM_PRIVATE_KEY
    && CUSTOMER_CODE.test(process.env.CF_STREAM_CUSTOMER_CODE || '')
  ) return 'cloudflare'
  return null
}

function clampTtl(ttlSeconds) {
  const fallback = Number(process.env.STREAMING_TOKEN_TTL_SECONDS) || 3600
  return Math.min(Math.max(Number(ttlSeconds) || fallback, 60), 21600)
}

function sign(payload, keyId, privateKey, ttl) {
  return jwt.sign(payload, readPrivateKey(privateKey), { algorithm: 'RS256', keyid: keyId, expiresIn: ttl })
}

/**
 * Returns { provider, hls, dash, expires_at } for an already-authorised viewer, or null when
 * streaming is not configured. Mux delivers HLS only, so `dash` is null for Mux.
 */
export function signPlayback({ videoId, ttlSeconds, audience = 'v' } = {}) {
  const provider = streamingProvider()
  if (!provider) return null
  if (!VIDEO_ID.test(String(videoId || ''))) {
    throw Object.assign(new Error('Invalid stream id.'), { status: 400 })
  }
  const ttl = clampTtl(ttlSeconds)
  const expires_at = new Date(Date.now() + ttl * 1000).toISOString()

  if (provider === 'mux') {
    // Mux audiences: 'v' video playback, 't' text tracks (captions), 's' storyboards.
    const token = sign({ sub: videoId, aud: ['v', 't', 's'].includes(audience) ? audience : 'v' }, process.env.MUX_SIGNING_KEY_ID, process.env.MUX_SIGNING_PRIVATE_KEY, ttl)
    return { provider, token, hls: `https://stream.mux.com/${videoId}.m3u8?token=${token}`, dash: null, expires_at }
  }

  const token = sign({ sub: videoId, kid: process.env.CF_STREAM_KEY_ID }, process.env.CF_STREAM_KEY_ID, process.env.CF_STREAM_PRIVATE_KEY, ttl)
  const base = `https://customer-${process.env.CF_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${token}/manifest`
  return { provider, hls: `${base}/video.m3u8`, dash: `${base}/video.mpd`, expires_at }
}

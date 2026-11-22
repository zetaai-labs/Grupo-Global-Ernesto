import { createHash, timingSafeEqual } from 'node:crypto'
import net from 'node:net'

/**
 * Cloudflare edge readiness (Technical Spec §3.1). Off unless CLOUDFLARE_ENABLED=true.
 *  - CF-Connecting-IP is believed only when the TCP peer is in CLOUDFLARE_TRUSTED_PROXIES.
 *  - CLOUDFLARE_ORIGIN_SECRET, if set, must arrive in the X-Origin-Secret header
 *    (added by a Cloudflare Transform Rule), so the origin cannot be reached directly.
 */

const stripMapped = (address) => String(address || '').replace(/^::ffff:/i, '')

function buildBlockList(value) {
  const list = new net.BlockList()
  let entries = 0
  for (const raw of String(value || '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const [address, prefix] = raw.split('/')
    const family = net.isIP(address)
    if (!family) continue
    const type = family === 6 ? 'ipv6' : 'ipv4'
    const max = family === 6 ? 128 : 32
    const bits = prefix === undefined ? max : Number(prefix)
    if (!Number.isInteger(bits) || bits < 0 || bits > max) continue
    list.addSubnet(address, bits, type)
    entries += 1
  }
  return { list, entries }
}

export function isTrustedProxy(peer) {
  const address = stripMapped(peer)
  const family = net.isIP(address)
  if (!family) return false
  const { list, entries } = buildBlockList(process.env.CLOUDFLARE_TRUSTED_PROXIES)
  return entries > 0 && list.check(address, family === 6 ? 'ipv6' : 'ipv4')
}

const digest = (value) => createHash('sha256').update(String(value)).digest()

/** True when no origin secret is enforced, or the supplied header matches it. */
export function originSecretValid(supplied) {
  if (process.env.CLOUDFLARE_ENABLED !== 'true' || !process.env.CLOUDFLARE_ORIGIN_SECRET) return true
  return timingSafeEqual(digest(supplied ?? ''), digest(process.env.CLOUDFLARE_ORIGIN_SECRET))
}

export function cloudflareEdge(req, res, next) {
  if (process.env.CLOUDFLARE_ENABLED !== 'true') return next()

  // Local health probes do not pass through Cloudflare.
  if (req.path !== '/api/health' && !originSecretValid(req.get('x-origin-secret'))) {
    return res.status(403).json({ message: 'Direct access is not allowed.' })
  }

  const clientIp = String(req.get('cf-connecting-ip') || '').trim()
  if (net.isIP(clientIp) && isTrustedProxy(req.socket.remoteAddress)) {
    Object.defineProperty(req, 'ip', { configurable: true, enumerable: true, get: () => clientIp })
  }
  return next()
}

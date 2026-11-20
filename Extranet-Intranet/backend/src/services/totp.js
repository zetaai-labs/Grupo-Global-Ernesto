import crypto from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer) {
  let bits = ''
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0')
  let result = ''
  for (let i = 0; i < bits.length; i += 5) {
    result += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]
  }
  return result
}

function base32Decode(value) {
  const bits = [...value.toUpperCase().replace(/=+$/, '')]
    .map((char) => ALPHABET.indexOf(char))
    .filter((index) => index >= 0)
    .map((index) => index.toString(2).padStart(5, '0'))
    .join('')
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

export function generateSecret() {
  return base32Encode(crypto.randomBytes(20))
}

export function otpauthUrl(email, secret, issuer = 'Global Group') {
  const label = encodeURIComponent(`${issuer}:${email}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`
}

function codeFor(secret, counter) {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const value =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]
  return String(value % 1000000).padStart(6, '0')
}

export function verifyCode(secret, code, window = 1) {
  if (!secret || !/^\d{6}$/.test(String(code))) return false
  const step = Math.floor(Date.now() / 30000)
  for (let offset = -window; offset <= window; offset += 1) {
    if (codeFor(secret, step + offset) === String(code)) return true
  }
  return false
}

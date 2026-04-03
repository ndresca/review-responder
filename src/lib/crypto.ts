import * as crypto from 'crypto'

const KEY_BYTES = 32  // AES-256
const IV_BYTES = 16
const AUTH_TAG_BYTES = 16  // GCM default

function getKey(): Buffer {
  const raw = process.env.OAUTH_ENCRYPTION_KEY
  if (!raw) throw new Error('OAUTH_ENCRYPTION_KEY is not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new Error(`OAUTH_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length})`)
  }
  return key
}

/**
 * Encrypts a string with AES-256-GCM.
 *
 * The auth tag (16 bytes) is appended to the ciphertext before base64-encoding
 * so it travels with the data and is verified automatically on decrypt.
 *
 * Store both return values. IV is not secret — it just must be unique per call.
 */
export function encrypt(plaintext: string): { ciphertext: string; iv: string } {
  const key = getKey()
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  // Concat auth tag so decrypt can verify integrity without a separate column
  const payload = Buffer.concat([encrypted, cipher.getAuthTag()])

  return {
    ciphertext: payload.toString('base64'),
    iv: iv.toString('base64'),
  }
}

/**
 * Decrypts a value produced by encrypt().
 *
 * Throws if the key is wrong or the ciphertext has been tampered with —
 * GCM authentication catches both.
 */
export function decrypt(ciphertext: string, iv: string): string {
  const key = getKey()
  const payload = Buffer.from(ciphertext, 'base64')

  if (payload.length < AUTH_TAG_BYTES) {
    throw new Error('Ciphertext is too short to be valid')
  }

  const authTag = payload.subarray(payload.length - AUTH_TAG_BYTES)
  const encrypted = payload.subarray(0, payload.length - AUTH_TAG_BYTES)

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8')
}

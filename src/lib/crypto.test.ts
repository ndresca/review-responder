import * as nodeCrypto from 'crypto'
import { encrypt, decrypt } from './crypto'

const VALID_KEY = nodeCrypto.randomBytes(32).toString('base64')
const OTHER_KEY = nodeCrypto.randomBytes(32).toString('base64')

describe('encrypt / decrypt', () => {
  beforeEach(() => {
    process.env.OAUTH_ENCRYPTION_KEY = VALID_KEY
  })

  afterEach(() => {
    delete process.env.OAUTH_ENCRYPTION_KEY
  })

  it('round-trip: decrypt returns the original plaintext', () => {
    const token = 'ya29.A0ARrdaM-real-looking-oauth-refresh-token'
    const { ciphertext, iv } = encrypt(token)
    expect(decrypt(ciphertext, iv)).toBe(token)
  })

  it('produces a unique IV on every call', () => {
    const { iv: iv1 } = encrypt('same-plaintext')
    const { iv: iv2 } = encrypt('same-plaintext')
    expect(iv1).not.toBe(iv2)
  })

  it('ciphertext differs even for identical plaintexts (because IV differs)', () => {
    const { ciphertext: c1 } = encrypt('same-plaintext')
    const { ciphertext: c2 } = encrypt('same-plaintext')
    expect(c1).not.toBe(c2)
  })

  it('throws when decrypting with the wrong key', () => {
    const { ciphertext, iv } = encrypt('secret-refresh-token')
    process.env.OAUTH_ENCRYPTION_KEY = OTHER_KEY
    expect(() => decrypt(ciphertext, iv)).toThrow()
  })

  it('throws when the ciphertext is tampered', () => {
    const { ciphertext, iv } = encrypt('secret-refresh-token')
    const buf = Buffer.from(ciphertext, 'base64')
    buf[0] ^= 0xff  // flip a byte — auth tag check will catch this
    expect(() => decrypt(buf.toString('base64'), iv)).toThrow()
  })

  it('throws when OAUTH_ENCRYPTION_KEY is not set', () => {
    delete process.env.OAUTH_ENCRYPTION_KEY
    expect(() => encrypt('anything')).toThrow('OAUTH_ENCRYPTION_KEY')
  })

  it('throws when the key decodes to the wrong length', () => {
    process.env.OAUTH_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64')  // 16 bytes, not 32
    expect(() => encrypt('anything')).toThrow('32 bytes')
  })
})

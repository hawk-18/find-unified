import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, isEncrypted } from './crypto.js'

describe('crypto', () => {
  it('decrypt(encrypt(x)) === x', () => {
    const plaintext = 'secret123'
    expect(decrypt(encrypt(plaintext))).toBe(plaintext)
  })

  it('encrypt produces ivHex:ciphertextHex format', () => {
    const result = encrypt('test')
    const parts = result.split(':')
    expect(parts).toHaveLength(2)
    // iv is 16 bytes = 32 hex chars
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/)
    // ciphertext is non-empty hex
    expect(parts[1]).toMatch(/^[0-9a-f]+$/)
  })

  it('two encryptions of same plaintext produce different ciphertexts (random IV)', () => {
    const a = encrypt('hello')
    const b = encrypt('hello')
    expect(a).not.toBe(b)
  })

  it('isEncrypted returns true for encrypted value', () => {
    expect(isEncrypted(encrypt('test'))).toBe(true)
  })

  it('isEncrypted returns false for plaintext', () => {
    expect(isEncrypted('plaintext')).toBe(false)
    expect(isEncrypted('not:hex')).toBe(false)
    expect(isEncrypted('')).toBe(false)
  })
})

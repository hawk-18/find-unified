import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// ENCRYPTION_KEY must be a 32-byte hex-encoded string (64 hex chars)
// e.g. openssl rand -hex 32
// In development we fall back to a hard-coded dev key so the server starts without env config.
const DEV_KEY = 'a'.repeat(64) // 32 bytes of 0xaa — NOT for production
const KEY_HEX = process.env.ENCRYPTION_KEY ?? DEV_KEY

function getKey(): Buffer {
  if (KEY_HEX.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(KEY_HEX, 'hex')
}

/**
 * Encrypt plaintext using AES-256-CBC.
 * Returns "ivHex:ciphertextHex".
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypt a value produced by encrypt().
 * Expects "ivHex:ciphertextHex".
 */
export function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 2) {
    throw new Error('Invalid ciphertext format — expected "ivHex:ciphertextHex"')
  }
  const iv = Buffer.from(parts[0], 'hex')
  const encrypted = Buffer.from(parts[1], 'hex')
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Return true if the value looks like an encrypted string (ivHex:ciphertextHex).
 * Used to avoid double-encrypting values that are already encrypted.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  if (parts.length !== 2) return false
  return /^[0-9a-f]{32}$/.test(parts[0]) && /^[0-9a-f]+$/.test(parts[1])
}

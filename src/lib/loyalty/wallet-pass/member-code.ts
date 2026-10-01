/**
 * The member card's identity: a random serial, and the QR payload built on it.
 *
 * The serial is the ONLY identifier a wallet pass carries. It is random (144
 * bits), so it cannot be guessed from a phone number, and it is not a phone
 * number, so a photographed pass leaks nothing a stranger can reuse elsewhere.
 * The POS resolves it back to a member on the server.
 *
 * The `WNLC1.` prefix keeps a scanned card from ever being mistaken for a
 * reward claim token (`v1.…`) or a pickup QR on the same camera.
 */

import { randomBytes } from 'node:crypto'

const SERIAL_BYTES = 18
const SERIAL_PATTERN = /^[A-Za-z0-9_-]{24}$/
const MEMBER_CODE_PREFIX = 'WNLC1.'

export function createPassSerial(random: (size: number) => Buffer = randomBytes): string {
  return random(SERIAL_BYTES).toString('base64url')
}

export function isPassSerial(value: unknown): value is string {
  return typeof value === 'string' && SERIAL_PATTERN.test(value)
}

export function encodeMemberCode(serial: string): string {
  return `${MEMBER_CODE_PREFIX}${serial}`
}

/** The serial inside a scanned card, or null for anything that is not one. */
export function parseMemberCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value.startsWith(MEMBER_CODE_PREFIX)) return null
  const serial = value.slice(MEMBER_CODE_PREFIX.length)
  return isPassSerial(serial) ? serial : null
}

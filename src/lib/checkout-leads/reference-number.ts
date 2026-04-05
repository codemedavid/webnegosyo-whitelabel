// Excludes ambiguous characters: O, 0, I, 1, L
export const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateReferenceNumber(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  const datePart = `${y}${m}${d}`

  let random = ''
  for (let i = 0; i < 4; i++) {
    random += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  }

  return `WN-${datePart}-${random}`
}

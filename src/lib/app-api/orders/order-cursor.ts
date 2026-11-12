// Opaque history cursor: base64url("<created_at>|<id>") of the last row on a
// page. The timestamp is kept exactly as Postgres returned it (microseconds),
// so the keyset never skips or repeats a row through a JS Date round trip.
// Every decode is validated: a cursor is client input.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/
const BASE64URL = /^[A-Za-z0-9_-]+$/
const MAX_CURSOR_LENGTH = 200

export interface OrderCursor {
  createdAt: string
  id: string
}

export function encodeOrderCursor(cursor: OrderCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, 'utf8').toString('base64url')
}

/** null = not a cursor this server issued (tampered, truncated or foreign). */
export function decodeOrderCursor(raw: string): OrderCursor | null {
  if (raw.length === 0 || raw.length > MAX_CURSOR_LENGTH || !BASE64URL.test(raw)) return null
  const decoded = Buffer.from(raw, 'base64url').toString('utf8')
  const parts = decoded.split('|')
  if (parts.length !== 2) return null
  const [createdAt, id] = parts
  if (!TIMESTAMP.test(createdAt) || !UUID.test(id)) return null
  if (!Number.isFinite(Date.parse(createdAt.replace(' ', 'T')))) return null
  return { createdAt, id: id.toLowerCase() }
}

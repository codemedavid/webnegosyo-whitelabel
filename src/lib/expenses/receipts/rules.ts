/**
 * Expense receipts — the rules both receipt routes share.
 *
 * A receipt lives in the PRIVATE bucket `expense-receipts` (no storage
 * policies: only the service role touches it) at
 * `<tenant>/<expense>/<receipt id>.<ext>` — a path the table's CHECK
 * constraint re-validates. A link to one lasts five minutes.
 *
 * The type is decided by the file's first bytes, never by the name or the
 * Content-Type the client claims: a renamed executable must not land in the
 * bucket as `receipt.jpg`.
 */

export const RECEIPT_BUCKET = 'expense-receipts'
/** Same cap as the bucket's `file_size_limit` and the table's CHECK. */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024
/** Multipart framing on top of the file itself. */
export const MAX_RECEIPT_REQUEST_BYTES = MAX_RECEIPT_BYTES + 64 * 1024
/** Vercel refuses a function request body over 4.5 MB before our code runs. */
const PLATFORM_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024
/** What an upload request may really carry: the tighter of our cap and the platform's. */
export const MAX_RECEIPT_UPLOAD_REQUEST_BYTES = Math.min(MAX_RECEIPT_REQUEST_BYTES, PLATFORM_BODY_LIMIT_BYTES)
export const RECEIPT_TOO_LARGE_MESSAGE = 'The file is too large. Keep a receipt under 4 MB: take a smaller photo, or compress the PDF.'
export const RECEIPT_LINK_TTL_SECONDS = 5 * 60
/** A sanity bound: an expense with this many receipts is being abused, not documented. */
export const MAX_RECEIPTS_PER_EXPENSE = 10

export type ReceiptMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

export interface SniffedReceipt {
  mime: ReceiptMime
  extension: 'jpg' | 'png' | 'webp' | 'pdf'
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0))
}

/** The receipt's real type from its magic bytes, or null when it is not one we keep. */
export function sniffReceiptType(bytes: Uint8Array): SniffedReceipt | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', extension: 'jpg' }
  if (startsWith(bytes, PNG_SIGNATURE)) return { mime: 'image/png', extension: 'png' }
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return { mime: 'image/webp', extension: 'webp' }
  if (startsWith(bytes, ascii('%PDF-'))) return { mime: 'application/pdf', extension: 'pdf' }
  return null
}

/** Filed under the store and the expense, named by a random id — never by the uploaded name. */
export function receiptObjectPath(tenantId: string, expenseId: string, receiptId: string, extension: string): string {
  return `${tenantId.toLowerCase()}/${expenseId.toLowerCase()}/${receiptId.toLowerCase()}.${extension}`
}

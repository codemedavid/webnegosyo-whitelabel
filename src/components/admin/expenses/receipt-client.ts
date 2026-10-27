/**
 * Receipts from the browser: what may be attached, and the two routes that
 * store and show them (contract §8). The bucket is private; a receipt is only
 * ever shown through a short-lived signed link.
 */

export const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
/** Vercel caps a request body at 4.5 MB; the multipart wrapper needs the rest. */
export const RECEIPT_MAX_UPLOAD_BYTES = Math.floor(4.4 * 1024 * 1024)
/** A phone photo may start bigger: it is shrunk in the browser before it is sent. */
export const RECEIPT_MAX_PICKED_IMAGE_BYTES = 30 * 1024 * 1024
/** Photos are sent at most this many pixels on the long side, as JPEG. */
export const RECEIPT_MAX_EDGE_PX = 1600
const RECEIPT_JPEG_QUALITY = 0.85
/** The server keeps at most this many receipts per expense. */
export const MAX_RECEIPTS_PER_EXPENSE = 10
export const RECEIPT_ACCEPT = RECEIPT_MIME_TYPES.join(',')

/** The sentence to show for a file that can't be attached, or null. */
export function receiptFileProblem(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} isn’t a photo or PDF. Use JPG, PNG, WebP or PDF.`
  }
  if (file.size <= 0) return `${file.name} is empty.`
  if (file.type === 'application/pdf' && file.size > RECEIPT_MAX_UPLOAD_BYTES) {
    return `${file.name} is over 4 MB. Compress the PDF, or attach a photo of it instead.`
  }
  if (file.size > RECEIPT_MAX_PICKED_IMAGE_BYTES) return `${file.name} is too large. Take a smaller photo.`
  return null
}

/** Long side scaled down to `maxEdge`, never up. */
export function fitWithin(width: number, height: number, maxEdge: number = RECEIPT_MAX_EDGE_PX): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge || longest <= 0) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable image'))
    }
    image.src = url
  })
}

/**
 * Photos are re-drawn at ≤1600px as JPEG before upload, so a 12 MP phone
 * photo fits under the body cap and stays readable. A PDF goes as it is.
 */
export async function prepareReceiptFile(file: File): Promise<ReceiptResult<File>> {
  if (file.type === 'application/pdf') {
    return file.size <= RECEIPT_MAX_UPLOAD_BYTES ? { ok: true, data: file } : { ok: false, error: `${file.name} is over 4 MB.` }
  }
  try {
    const image = await loadImage(file)
    const size = fitWithin(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas')
    // JPEG has no transparency: a PNG's clear background becomes white, not black.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size.width, size.height)
    context.drawImage(image, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', RECEIPT_JPEG_QUALITY))
    if (!blob) throw new Error('no blob')
    if (blob.size > RECEIPT_MAX_UPLOAD_BYTES) return { ok: false, error: `${file.name} is still too large after shrinking.` }
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return { ok: true, data: new File([blob], name, { type: 'image/jpeg' }) }
  } catch {
    // Can't re-draw it here: send the original if it already fits.
    return file.size <= RECEIPT_MAX_UPLOAD_BYTES
      ? { ok: true, data: file }
      : { ok: false, error: `Couldn’t shrink ${file.name}. Take a smaller photo.` }
  }
}

async function errorText(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    return typeof body.error === 'string' && body.error.trim() !== '' ? body.error : fallback
  } catch {
    return fallback
  }
}

export type ReceiptResult<T> = { ok: true; data: T } | { ok: false; error: string }

export async function uploadReceipt(expenseId: string, picked: File): Promise<ReceiptResult<{ id: string }>> {
  const prepared = await prepareReceiptFile(picked)
  if (!prepared.ok) return prepared
  const file = prepared.data
  const body = new FormData()
  body.append('expenseId', expenseId)
  body.append('file', file)
  try {
    const response = await fetch('/api/expenses/receipts', { method: 'POST', body })
    if (!response.ok) return { ok: false, error: await errorText(response, `Couldn’t attach ${file.name}. Try again.`) }
    const json = (await response.json()) as { id?: unknown }
    return typeof json.id === 'string' ? { ok: true, data: { id: json.id } } : { ok: false, error: `Couldn’t attach ${file.name}.` }
  } catch {
    return { ok: false, error: `Couldn’t attach ${file.name}. Check your connection and try again.` }
  }
}

export async function fetchReceiptLink(receiptId: string): Promise<ReceiptResult<{ url: string; expiresAt: string }>> {
  try {
    const response = await fetch(`/api/expenses/receipts/link?id=${encodeURIComponent(receiptId)}`, { cache: 'no-store' })
    if (!response.ok) return { ok: false, error: await errorText(response, 'Couldn’t open this receipt.') }
    const json = (await response.json()) as { url?: unknown; expiresAt?: unknown }
    if (typeof json.url !== 'string' || !/^https?:\/\//.test(json.url)) return { ok: false, error: 'Couldn’t open this receipt.' }
    return { ok: true, data: { url: json.url, expiresAt: typeof json.expiresAt === 'string' ? json.expiresAt : '' } }
  } catch {
    return { ok: false, error: 'Couldn’t open this receipt. Check your connection.' }
  }
}

/** Uploads one by one; returns the sentences for the ones that failed. */
export async function uploadReceipts(expenseId: string, files: readonly File[]): Promise<string[]> {
  const failures: string[] = []
  for (const file of files) {
    const result = await uploadReceipt(expenseId, file)
    if (!result.ok) failures.push(result.error)
  }
  return failures
}

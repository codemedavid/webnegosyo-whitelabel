/**
 * The payment screenshot goes up through the web checkout's own upload,
 * `POST /api/payment-proof/upload` (JPEG/PNG/WEBP judged by their bytes, 5 MB,
 * the server picks the folder and name, per-IP limit). The order then carries
 * only `{ url, fileId }`, and the order route keeps the url only when it is on
 * the store's ImageKit folder, exactly as for the web.
 *
 * Phones shrink the photo first (≤1600 px, JPEG): a full-size screenshot can
 * pass Vercel's 4.5 MB request limit.
 */

export const PROOF_MAX_EDGE = 1600
export const PROOF_JPEG_QUALITY = 0.8

export interface UploadedProof {
  url: string
  fileId: string
}

/** A local file to send: what the image picker (after shrinking) hands back. */
export interface ProofFile {
  uri: string
  name: string
  type: string
}

interface UploadResponse {
  status: number
  json(): Promise<unknown>
}

type UploadTransport = (url: string, form: FormData) => Promise<UploadResponse>

/**
 * React Native's XMLHttpRequest, not `fetch`: Expo's fetch refuses a FormData
 * file part given as `{ uri, name, type }` ("Unsupported FormDataPart
 * implementation"), while the native XHR streams it from disk.
 */
export const xhrTransport: UploadTransport = (url, form) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', url)
    request.setRequestHeader('Accept', 'application/json')
    request.timeout = 60_000
    request.onload = () => {
      const text = request.responseText
      resolve({ status: request.status, json: async () => JSON.parse(text) })
    }
    request.onerror = () => reject(new Error('network'))
    request.ontimeout = () => reject(new Error('timeout'))
    request.send(form)
  })

const GENERIC = 'We couldn’t upload your screenshot. Check your connection and try again.'

/** The upload route's answer → the proof, or an Error carrying words for the customer. */
export function readUploadReply(status: number, body: unknown): UploadedProof {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  if (status >= 200 && status < 300 && typeof record.url === 'string' && typeof record.fileId === 'string' && record.fileId !== '') {
    return { url: record.url, fileId: record.fileId }
  }
  if (status === 413) throw new Error('That screenshot is too large. Choose a smaller one.')
  if (status === 429) throw new Error('Too many uploads. Wait a moment, then try again.')
  if (status === 400 && typeof record.error === 'string') throw new Error(record.error)
  throw new Error(GENERIC)
}

/** The size to ask for so the long edge is at most `PROOF_MAX_EDGE`; null = already small enough. */
export function shrinkTarget(width: number, height: number): { width: number } | { height: number } | null {
  if (!(width > 0 && height > 0) || Math.max(width, height) <= PROOF_MAX_EDGE) return null
  return width >= height ? { width: PROOF_MAX_EDGE } : { height: PROOF_MAX_EDGE }
}

export async function uploadProofFile(baseUrl: string, file: ProofFile, transport: UploadTransport = xhrTransport): Promise<UploadedProof> {
  const form = new FormData()
  // React Native's FormData takes a file as { uri, name, type }.
  form.append('file', file as unknown as Blob)
  form.append('purpose', 'order')
  let response: UploadResponse
  try {
    response = await transport(`${baseUrl.replace(/\/+$/, '')}/api/payment-proof/upload`, form)
  } catch {
    throw new Error(GENERIC)
  }
  const body = await response.json().catch(() => null)
  return readUploadReply(response.status, body)
}

/**
 * Browser-side ImageKit upload helpers.
 *
 * Staff uploads (admin / superadmin): ask `/api/imagekit/auth` (POST, cookie
 * session) to SIGN the folder + file name, then upload straight to ImageKit's
 * v2 endpoint with exactly the signed fields. The signature binds
 * useUniqueFileName=true / overwriteFile=false, so nobody can replace an
 * existing asset with it.
 *
 * Customer payment proofs: posted to `/api/payment-proof/upload`, which checks
 * the bytes and stores the file server-side — a visitor never holds ImageKit
 * credentials. Both use XHR so callers can show upload progress.
 */

export interface ImageKitUploadResult {
  /** Full delivery URL */
  url: string
  /** Opaque ImageKit file id (used for deletion) */
  fileId: string
  /** Path relative to the URL endpoint (used to scope deletion) */
  filePath: string
}

interface SignedUpload {
  token: string
  fields: Record<string, string>
  uploadUrl: string
}

export function isImageKitConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY &&
      process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT,
  )
}

/**
 * Pull a human-readable reason out of an upload/auth error body. ImageKit
 * answers with `{ message }`, our own auth route with `{ error }`. Returns null
 * when the body is empty, HTML, or otherwise unreadable.
 */
export function readUploadErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown }
    const reason = parsed.message ?? parsed.error
    return typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null
  } catch {
    return null
  }
}

async function fetchSignedUpload(folder: string, fileName: string): Promise<SignedUpload> {
  const res = await fetch('/api/imagekit/auth', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, fileName }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const reason = readUploadErrorMessage(body)
    console.error('[imagekit] upload auth failed', { status: res.status, body })
    throw new Error(reason ?? `Could not authorize upload (${res.status}). Please try again.`)
  }
  return (await res.json()) as SignedUpload
}

interface UploadOptions {
  folder: string
  fileName?: string
  onProgress?: (percent: number) => void
}

/**
 * POST `formData` with progress, resolving the { url, fileId, filePath } an
 * ImageKit upload (or our proof route, which relays it) answers with. Rejects
 * with the service's own reason when it refuses.
 */
function sendUpload(
  url: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<ImageKitUploadResult> {
  return new Promise<ImageKitUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      })
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText) as {
            url?: string
            fileId?: string
            filePath?: string
          }
          if (json.url && json.fileId && json.filePath) {
            // ImageKit returns filePath with a leading slash; normalize it.
            resolve({
              url: json.url,
              fileId: json.fileId,
              filePath: json.filePath.replace(/^\//, ''),
            })
            return
          }
          reject(new Error('Upload response was missing fields.'))
        } catch {
          reject(new Error('Could not parse upload response.'))
        }
      } else {
        // Surface what the upload service actually said (e.g. "Upload Limit
        // Exceeded", "File size too large"). A generic retry message here sends
        // merchants into a loop against a failure retrying can never clear.
        const reason = readUploadErrorMessage(xhr.responseText)
        console.error('[imagekit] upload rejected', {
          status: xhr.status,
          body: xhr.responseText,
        })
        reject(new Error(reason ?? `Upload failed (${xhr.status}). Please try again.`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed. Please check your connection.'))
    })

    xhr.open('POST', url)
    xhr.send(formData)
  })
}

/**
 * Upload a single image file to ImageKit (staff only) and return its
 * url + fileId + filePath. Throws on auth failure, network error, or a
 * non-2xx upload response.
 */
export async function uploadImageToImageKit(
  file: File,
  { folder, fileName, onProgress }: UploadOptions,
): Promise<ImageKitUploadResult> {
  if (!isImageKitConfigured()) {
    throw new Error('Image upload is not configured.')
  }

  const signed = await fetchSignedUpload(folder, fileName || file.name || 'upload')

  // v2 refuses any request whose fields differ from the signed payload, so
  // send the server's (sanitised) fields verbatim — nothing added, nothing left out.
  const formData = new FormData()
  formData.append('file', file)
  for (const [key, value] of Object.entries(signed.fields)) {
    formData.append(key, value)
  }
  formData.append('token', signed.token)

  return sendUpload(signed.uploadUrl, formData, onProgress)
}

/** Which proof this is: a customer order, or a merchant's platform sign-up. */
export type PaymentProofPurpose = 'order' | 'platform-signup'

interface PaymentProofUploadOptions {
  purpose?: PaymentProofPurpose
  onProgress?: (percent: number) => void
}

/**
 * Vercel refuses request bodies over 4.5 MB before our route runs, while the
 * checkout accepts screenshots up to 5 MB. Anything above this is re-encoded
 * in the browser first.
 */
const PROOF_UPLOAD_TARGET_BYTES = 4_000_000
const PROOF_MAX_DIMENSION = 2560
const PROOF_JPEG_QUALITY = 0.85

/**
 * Re-encode a large photo as a smaller JPEG. Returns the original file when
 * it is already small enough, when the browser cannot decode it, or when
 * re-encoding does not help — the server then decides.
 */
async function shrinkImageForUpload(file: File): Promise<File> {
  if (file.size <= PROOF_UPLOAD_TARGET_BYTES) return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, PROOF_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', PROOF_JPEG_QUALITY),
    )
    if (!blob || blob.size >= file.size) return file
    const baseName = (file.name || 'payment-proof').replace(/\.[^.]+$/, '')
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  } catch (error) {
    console.warn('[imagekit] could not shrink payment proof; sending original', error)
    return file
  }
}

/**
 * Upload a customer's payment screenshot through the server. Same result shape
 * as `uploadImageToImageKit`, so the order payload (url + fileId) is unchanged.
 */
export async function uploadPaymentProofImage(
  file: File,
  { purpose = 'order', onProgress }: PaymentProofUploadOptions = {},
): Promise<ImageKitUploadResult> {
  if (!isImageKitConfigured()) {
    throw new Error('Image upload is not configured.')
  }

  const upload = await shrinkImageForUpload(file)
  const formData = new FormData()
  formData.append('file', upload, upload.name || 'payment-proof')
  formData.append('purpose', purpose)

  return sendUpload('/api/payment-proof/upload', formData, onProgress)
}

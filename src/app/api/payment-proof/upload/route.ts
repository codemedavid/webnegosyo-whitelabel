import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { uploadBufferToImageKit } from '@/lib/imagekit-server'
import { detectImageMime, type DetectedImageMime } from '@/lib/imagekit-signature'
import { PAYMENT_PROOF_FOLDER, PAYMENT_PROOF_MAX_FILE_SIZE } from '@/lib/payment-proof'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'

/**
 * POST /api/payment-proof/upload (multipart: `file`, optional `purpose`)
 *
 * Anonymous customers upload their payment screenshot HERE, not straight to
 * ImageKit. The old flow handed every visitor a v1 upload signature that did
 * not cover folder / fileName / overwriteFile, which let anyone overwrite any
 * tenant's logo, menu photo or payment QR. Now the server:
 *  - accepts only JPEG / PNG / WEBP, judged by the file's bytes;
 *  - caps the size (the client already refuses > 5 MB, and compresses large
 *    photos to stay under Vercel's 4.5 MB request-body limit);
 *  - chooses the folder and a random file name itself;
 *  - uploads with the private key, unique-named and never overwriting;
 *  - rate limits per client IP (shared across instances).
 *
 * Response shape matches the old client upload: { url, fileId, filePath }.
 */
export const dynamic = 'force-dynamic'

/**
 * A customer retrying a screenshot a few times is fine; a script is not.
 * Generous because many phones share one carrier-NAT address.
 */
const UPLOAD_RATE_LIMIT = { limit: 20, windowSec: 600 }

/** Multipart framing on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024

/** Platform sign-up (merchant buying a plan) proofs keep their own folder. */
const PURPOSE_FOLDERS: Readonly<Record<string, string>> = {
  order: PAYMENT_PROOF_FOLDER,
  'platform-signup': 'checkout-proofs',
}

const EXTENSIONS: Readonly<Record<DetectedImageMime, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const NO_STORE = { 'Cache-Control': 'no-store' }

function respond(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

const TOO_LARGE = { error: 'Screenshot is too large (max 5MB).' }

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(request)
  if (ip) {
    const rate = await checkRateLimit(`payment-proof-upload:${ip}`, UPLOAD_RATE_LIMIT)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads. Please wait a moment and try again.' },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.retryAfterSec) } },
      )
    }
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > PAYMENT_PROOF_MAX_FILE_SIZE + MULTIPART_OVERHEAD_BYTES) {
    return respond(TOO_LARGE, 413)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return respond({ error: 'Expected a multipart upload.' }, 400)
  }

  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return respond({ error: 'No screenshot was attached.' }, 400)
  }
  if (file.size === 0) {
    return respond({ error: 'The screenshot is empty.' }, 400)
  }
  if (file.size > PAYMENT_PROOF_MAX_FILE_SIZE) {
    return respond(TOO_LARGE, 413)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = detectImageMime(bytes)
  if (!mimeType) {
    return respond({ error: 'Please upload a PNG, JPG, or WEBP image.' }, 415)
  }

  const purpose = form.get('purpose')
  const folder = (typeof purpose === 'string' && PURPOSE_FOLDERS[purpose]) || PAYMENT_PROOF_FOLDER
  const fileName = `proof-${randomUUID()}.${EXTENSIONS[mimeType]}`

  try {
    const uploaded = await uploadBufferToImageKit(bytes, { folder, fileName, mimeType })
    return respond(uploaded)
  } catch (error) {
    console.error('[payment-proof/upload] upload failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    const isUnconfigured = error instanceof Error && /not configured/i.test(error.message)
    return isUnconfigured
      ? respond({ error: 'Screenshot upload is not configured. Please enter your reference number instead.' }, 503)
      : respond({ error: 'We could not upload your screenshot. Please try again.' }, 502)
  }
}

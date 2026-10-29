import { NextRequest, NextResponse } from 'next/server'
import { createSignedUploadToken } from '@/lib/imagekit-server'
import { resolveImageKitUploader, type UploaderResolution } from '@/lib/imagekit-uploader-auth'
import { sanitizeUploadFileName, sanitizeUploadFolder } from '@/lib/imagekit-signature'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { getUploadProvider } from '@/lib/storage/r2-config'
import { contentTypeForFileName, maxUploadBytesFor, normalizeUploadContentType } from '@/lib/storage/object-key'
import { newObjectKey, presignR2Put } from '@/lib/storage/r2-server'

/**
 * Sign ONE staff upload to wherever new uploads go (`STORAGE_UPLOAD_PROVIDER`).
 *
 * POST { folder, fileName, contentType, size } — same callers and same access
 * rule as `/api/imagekit/auth` (tenant admin / superadmin / platform staff with
 * an upload grant; cookie session or Bearer token).
 *
 * Answers `{ provider: 'r2', uploadUrl, method, headers, url, fileId, filePath }`
 * — a presigned PUT bound to the key, type, exact size and no-overwrite — or
 * `{ provider: 'imagekit', token, fields, uploadUrl, publicKey }`, the same
 * token `/api/imagekit/auth` issues. That older route stays for app builds
 * that only know ImageKit.
 */
export const dynamic = 'force-dynamic'

const SIGN_RATE_LIMIT = { limit: 120, windowSec: 600 }
const NO_STORE = { 'Cache-Control': 'no-store' }
const TOO_MANY = { error: 'Too many upload requests. Please wait a moment and try again.' }

function respond(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

async function isRateLimited(request: NextRequest): Promise<boolean> {
  const ip = getClientIP(request)
  if (!ip) return false
  const result = await checkRateLimit(`uploads-sign:${ip}`, SIGN_RATE_LIMIT)
  return !result.allowed
}

function refusal(resolution: UploaderResolution): NextResponse {
  return resolution.status === 'anonymous'
    ? respond({ error: 'Sign in to upload images.' }, 401)
    : respond({ error: 'You do not have permission to upload images.' }, 403)
}

interface SignBody {
  folder?: unknown
  fileName?: unknown
  contentType?: unknown
  size?: unknown
}

async function signR2(folder: string, fileName: string, body: SignBody): Promise<NextResponse> {
  // Some browsers send no type for documents; then the extension decides.
  const declared = typeof body.contentType === 'string' ? body.contentType.trim() : ''
  const contentType = declared ? normalizeUploadContentType(declared) : contentTypeForFileName(fileName)
  if (!contentType) return respond({ error: 'This file type cannot be uploaded.' }, 415)

  const size = typeof body.size === 'number' ? body.size : Number.NaN
  if (!Number.isInteger(size) || size <= 0) return respond({ error: 'Invalid file size.' }, 400)
  if (size > maxUploadBytesFor(contentType)) {
    const limitMb = Math.floor(maxUploadBytesFor(contentType) / (1024 * 1024))
    return respond({ error: `File is too large (max ${limitMb} MB).` }, 413)
  }

  try {
    const signed = await presignR2Put(newObjectKey(folder, fileName, contentType), contentType, size)
    return respond({ provider: 'r2', ...signed })
  } catch (error) {
    console.error('[uploads/sign] presign failed', { error: error instanceof Error ? error.message : String(error) })
    return respond({ error: 'Image upload is not configured.' }, 503)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (await isRateLimited(request)) return respond(TOO_MANY, 429)

  const resolution = await resolveImageKitUploader(request)
  if (resolution.status !== 'authorized') return refusal(resolution)

  const body = ((await request.json().catch(() => null)) ?? {}) as SignBody
  const folder = typeof body.folder === 'string' ? sanitizeUploadFolder(body.folder) : null
  if (!folder) return respond({ error: 'Invalid upload folder.' }, 400)
  const fileName = sanitizeUploadFileName(typeof body.fileName === 'string' ? body.fileName : '')

  if (getUploadProvider() === 'r2') return signR2(folder, fileName, body)

  const signed = createSignedUploadToken({ folder, fileName })
  if (!signed) return respond({ error: 'Image upload is not configured.' }, 503)
  return respond({ provider: 'imagekit', ...signed })
}

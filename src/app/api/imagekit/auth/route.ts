import { NextRequest, NextResponse } from 'next/server'
import { createSignedUploadToken, getUploadAuthParams } from '@/lib/imagekit-server'
import { resolveImageKitUploader, type UploaderResolution } from '@/lib/imagekit-uploader-auth'
import { sanitizeUploadFileName, sanitizeUploadFolder } from '@/lib/imagekit-signature'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'

/**
 * Issue ImageKit client-upload credentials to STORE STAFF.
 *
 * POST { folder, fileName } — current clients (web admin, merchant app).
 *   Requires a tenant admin / superadmin (cookie session or
 *   `Authorization: Bearer <supabase access token>`). Returns an upload API v2
 *   token whose signature binds folder, fileName, useUniqueFileName=true and
 *   overwriteFile=false: ImageKit rejects the upload if any parameter differs.
 *
 * GET — legacy clients only (merchant-app binaries that predate the fix). The
 *   v1 signature covers token+expire and nothing else, so its holder chooses
 *   folder / overwrite freely. Served to anonymous callers ONLY while
 *   `IMAGEKIT_AUTH_REQUIRED` is not 'true'; flip it once those builds are gone.
 *
 * Customers never come here: payment-proof screenshots are uploaded through
 * /api/payment-proof/upload, which stores them server-side.
 *
 * Not cached — each call must return fresh, short-lived credentials.
 */
export const dynamic = 'force-dynamic'

/** A merchant bulk-uploading menu photos stays well under this. */
const AUTH_RATE_LIMIT = { limit: 120, windowSec: 600 }

const NO_STORE = { 'Cache-Control': 'no-store' }

function respond(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

function isAuthEnforced(): boolean {
  return process.env.IMAGEKIT_AUTH_REQUIRED === 'true'
}

async function isRateLimited(request: NextRequest): Promise<boolean> {
  const ip = getClientIP(request)
  if (!ip) return false
  const result = await checkRateLimit(`imagekit-auth:${ip}`, AUTH_RATE_LIMIT)
  return !result.allowed
}

function refusal(resolution: UploaderResolution): NextResponse {
  return resolution.status === 'anonymous'
    ? respond({ error: 'Sign in to upload images.' }, 401)
    : respond({ error: 'You do not have permission to upload images.' }, 403)
}

const TOO_MANY = { error: 'Too many upload requests. Please wait a moment and try again.' }

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (await isRateLimited(request)) return respond(TOO_MANY, 429)

  const resolution = await resolveImageKitUploader(request)
  if (resolution.status !== 'authorized') return refusal(resolution)

  const body = (await request.json().catch(() => null)) as { folder?: unknown; fileName?: unknown } | null
  const folder = typeof body?.folder === 'string' ? sanitizeUploadFolder(body.folder) : null
  if (!folder) {
    return respond({ error: 'Invalid upload folder.' }, 400)
  }
  const fileName = sanitizeUploadFileName(typeof body?.fileName === 'string' ? body.fileName : '')

  const signed = createSignedUploadToken({ folder, fileName })
  if (!signed) {
    return respond({ error: 'Image upload is not configured.' }, 503)
  }
  return respond(signed)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (await isRateLimited(request)) return respond(TOO_MANY, 429)

  const resolution = await resolveImageKitUploader(request)
  if (resolution.status !== 'authorized') {
    if (isAuthEnforced()) return refusal(resolution)
    // Rollout visibility: how much unauthenticated legacy traffic remains
    // before IMAGEKIT_AUTH_REQUIRED can be switched on.
    console.warn('[imagekit] legacy unauthenticated upload auth issued', { status: resolution.status })
  }

  const params = getUploadAuthParams()
  if (!params) {
    return respond({ error: 'Image upload is not configured.' }, 503)
  }
  return respond(params)
}

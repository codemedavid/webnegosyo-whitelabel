import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { checkRateLimit } from '@/lib/rate-limit'
import { parseIdPhotoUploadRequest } from '@/lib/gov-discount-ledger/request-schemas'

const BURST = { maxRequests: 30, windowMs: 60_000 }

/**
 * POST /api/gov-discounts/id-photos
 *
 * The register uploading the optional photo of a Senior/PWD ID it took for a
 * grant already in the sales book. Bearer token of a member of the store; the
 * service role writes the private object and its row (nobody else can).
 *
 * 2xx = stored. 409 `claim_pending` = the grant has not been recorded yet,
 * try again. 400/410/413 = never storable (photos switched off, past the
 * 90 days, not an image, too large): the register drops it.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = parseIdPhotoUploadRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const upload = parsed.value

  const caller = await requireBearerStoreCaller(request, upload.tenantId, 'create')
  if (!caller.ok) return caller.response

  if (!checkRateLimit(`gov-id-photo:${caller.user.id}`, BURST).allowed) {
    return NextResponse.json({ error: 'Too many photos at once. Try again in a minute.' }, { status: 429 })
  }

  const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
  const { createSupabaseIdPhotoStore } = await import('@/lib/gov-discount-ledger/id-photos/supabase-id-photo-store')
  const { uploadIdPhoto } = await import('@/lib/gov-discount-ledger/id-photos/upload-service')

  try {
    const db = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const outcome = await uploadIdPhoto(createSupabaseIdPhotoStore(db), upload, caller.user.id, new Date(), randomUUID)
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: outcome.status })
    }
    return NextResponse.json({ success: true, replaced: outcome.replaced })
  } catch (error) {
    console.error('[gov-discounts/id-photos] upload failed', {
      tenantId: upload.tenantId,
      externalOrderId: upload.externalOrderId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Could not store the photo. It will be retried.' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authenticateBearer } from '@/lib/auth/bearer-caller'
import { checkRateLimit } from '@/lib/rate-limit'
import { parseIdPhotoLinkRequest } from '@/lib/gov-discount-ledger/request-schemas'
import { ID_PHOTO_BUCKET, ID_PHOTO_LINK_TTL_SECONDS } from '@/lib/gov-discount-ledger/id-photos/rules'

const BURST = { maxRequests: 60, windowMs: 60_000 }

interface Caller {
  db: SupabaseClient
  userId: string
}

/** The app sends a Bearer token; the web admin sends its session cookie. */
async function resolveCaller(request: NextRequest): Promise<Caller | null> {
  if (request.headers.get('authorization')) {
    const caller = await authenticateBearer(request)
    return caller.ok ? { db: caller.supabase, userId: caller.user.id } : null
  }
  const { createClient } = await import('@/lib/supabase/server')
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  return user ? { db: db as unknown as SupabaseClient, userId: user.id } : null
}

/**
 * POST /api/gov-discounts/id-photos/link
 *
 * A 60-second link to one ID photo, for a reviewer. The photo's row is read
 * with the CALLER's session, so RLS decides: `discount_review` holders only,
 * a branch-locked reviewer only for their branch, and never once the photo is
 * past its 90 days. Only then does the service role sign the private object.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = parseIdPhotoLinkRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { tenantId, photoId } = parsed.value

  const caller = await resolveCaller(request)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!checkRateLimit(`gov-id-photo-link:${caller.userId}`, BURST).allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 })
  }

  try {
    const { data, error } = await caller.db
      .from('gov_discount_id_photos')
      .select('object_path')
      .eq('id', photoId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const objectPath = (data as { object_path?: string } | null)?.object_path
    if (!objectPath) {
      return NextResponse.json({ error: 'This photo is not available. It may have been deleted after 90 days.' }, { status: 404 })
    }

    const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
    const admin = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const signed = await admin.storage.from(ID_PHOTO_BUCKET).createSignedUrl(objectPath, ID_PHOTO_LINK_TTL_SECONDS)
    if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message ?? 'no signed url')

    const expiresAt = new Date(Date.now() + ID_PHOTO_LINK_TTL_SECONDS * 1000).toISOString()
    return NextResponse.json(
      { url: signed.data.signedUrl, expiresAt },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[gov-discounts/id-photos/link] failed', {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Could not open the photo. Try again.' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { deletePaymentProofAsset } from '@/lib/imagekit-server'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { verifyProofDeleteToken } from '@/lib/payment-proof-delete-token'

/**
 * Delete a customer payment-proof screenshot from ImageKit.
 *
 * Called from web + mobile checkout when the customer swaps/removes a screenshot
 * before submitting (replace-cleanup), so we never accumulate orphaned uploads.
 *
 * Deletion is by ImageKit fileId. The server looks the id up and checks the
 * file's REAL path is inside payment-proofs and that it was uploaded within the
 * replace window. It used to check a caller-supplied `filePath` and then delete
 * the unrelated `fileId`, so any id — a tenant logo, a menu photo — could be
 * deleted. `filePath` is still accepted from older clients but ignored.
 * Best-effort: failures return 200 with deleted=false rather than blocking the
 * UI; a refused id is 403.
 *
 * Only the uploader may delete: the request must carry the `deleteToken` the
 * upload route returned for that file id (payment-proof-delete-token.ts). A
 * file id alone is no credential — it sits on every order screen — and a
 * customer's proof used to be deletable by anyone for two hours, including
 * one a submitted order still points at. A request without a token (an app
 * build from before tokens) is answered as a no-op success: cleanup is
 * best-effort, so an old build just leaves an orphaned upload behind.
 *
 * Legacy mobile builds may still POST { publicId } (Cloudinary). Those are
 * accepted as a no-op success so old clients don't error.
 */

const bodySchema = z.object({
  fileId: z.string().min(1).max(512).optional(),
  filePath: z.string().min(1).max(512).optional(),
  // Legacy Cloudinary field — accepted but no longer actionable.
  publicId: z.string().min(1).max(512).optional(),
  deleteToken: z.string().min(1).max(256).optional(),
})

/** Customers replace a screenshot while still on the checkout page. */
const REPLACE_WINDOW_MS = 2 * 60 * 60 * 1000

const DELETE_RATE_LIMIT = { limit: 30, windowSec: 600 }

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(request)
  if (ip) {
    const rate = await checkRateLimit(`payment-proof-delete:${ip}`, DELETE_RATE_LIMIT)
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
      )
    }
  }

  let parsed: z.infer<typeof bodySchema>
  try {
    const json = await request.json()
    const result = bodySchema.safeParse(json)
    if (!result.success) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }
    parsed = result.data
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // No ImageKit identifier → legacy/empty request, nothing to delete.
  if (!parsed.fileId) {
    return NextResponse.json({ success: true, deleted: false })
  }

  // Pre-token clients: nothing is deleted, nothing errors.
  if (!parsed.deleteToken) {
    return NextResponse.json({ success: true, deleted: false })
  }
  if (!verifyProofDeleteToken(parsed.fileId, parsed.deleteToken)) {
    return NextResponse.json(
      { success: false, error: 'This file is not a deletable payment proof' },
      { status: 403 },
    )
  }

  const outcome = await deletePaymentProofAsset(parsed.fileId, { maxAgeMs: REPLACE_WINDOW_MS })
  if (outcome === 'forbidden') {
    return NextResponse.json(
      { success: false, error: 'This file is not a deletable payment proof' },
      { status: 403 },
    )
  }

  return NextResponse.json({ success: true, deleted: outcome === 'deleted' || outcome === 'not_found' })
}

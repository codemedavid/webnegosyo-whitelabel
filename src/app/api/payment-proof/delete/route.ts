import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteImageKitAsset, isDeletablePaymentProofPath } from '@/lib/imagekit-server'

/**
 * Delete a customer payment-proof screenshot from ImageKit.
 *
 * Called from web + mobile checkout when the customer swaps/removes a screenshot
 * before submitting (replace-cleanup), so we never accumulate orphaned uploads.
 * Deletion is by ImageKit fileId but bounded to the payment-proofs folder via the
 * accompanying filePath, to limit abuse. Best-effort: failures return 200 with
 * deleted=false rather than blocking the UI.
 *
 * Legacy mobile builds may still POST { publicId } (Cloudinary). Those are
 * accepted as a no-op success so old clients don't error.
 */

const bodySchema = z.object({
  fileId: z.string().min(1).max(512).optional(),
  filePath: z.string().min(1).max(512).optional(),
  // Legacy Cloudinary field — accepted but no longer actionable.
  publicId: z.string().min(1).max(512).optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  // No ImageKit identifiers → legacy/empty request, nothing to delete.
  if (!parsed.fileId || !parsed.filePath) {
    return NextResponse.json({ success: true, deleted: false })
  }

  if (!isDeletablePaymentProofPath(parsed.filePath)) {
    return NextResponse.json(
      { success: false, error: 'filePath is not a deletable payment proof' },
      { status: 403 },
    )
  }

  const deleted = await deleteImageKitAsset(parsed.fileId)
  return NextResponse.json({ success: true, deleted })
}

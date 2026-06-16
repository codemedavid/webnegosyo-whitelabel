import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteCloudinaryAsset, isDeletablePaymentProofId } from '@/lib/cloudinary-server'

/**
 * Delete a customer payment-proof screenshot from Cloudinary.
 *
 * Called from web + mobile checkout when the customer swaps/removes a screenshot
 * before submitting (replace-cleanup), so we never accumulate orphaned uploads.
 * Deletion is bounded to the payment-proofs folder to limit abuse, and is
 * best-effort: failures return 200 with deleted=false rather than blocking the UI.
 */

const bodySchema = z.object({
  publicId: z.string().min(1).max(512),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  let parsed: { publicId: string }
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

  if (!isDeletablePaymentProofId(parsed.publicId)) {
    return NextResponse.json(
      { success: false, error: 'public_id is not a deletable payment proof' },
      { status: 403 },
    )
  }

  const deleted = await deleteCloudinaryAsset(parsed.publicId)
  return NextResponse.json({ success: true, deleted })
}

'use server'

/**
 * The server actions a transfer screen calls.
 *
 * Separate from `inventory.ts` deliberately. That file is the stock ledger's
 * surface — record a movement, read a history — and a transfer is a document
 * with a lifecycle of its own; folding four more actions into an already long
 * module would bury the one seam where a branch acts on another branch's stock.
 *
 * Every authority question is answered underneath, in
 * `stock-transfers-service.ts`, against `app_users` — never against anything the
 * client sent. What is decided here is only the shape of the input and the
 * shape of the answer.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  createTransfer,
  sendTransfer,
  receiveTransfer,
  cancelTransfer,
} from '@/lib/inventory/stock-transfers-service'

const inventoryPath = (slug: string) => `/${slug}/admin/inventory`

/**
 * A refusal is a message, not a throw.
 *
 * Every message these actions surface is written for the person reading it —
 * "You can only move stock in and out of your own branch" rather than a
 * constraint name — so passing the service's own text through is the right
 * answer, and the fallback only covers something unplanned.
 */
function fail(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return { success: false as const, error: error.issues[0]?.message ?? fallback }
  }
  return { success: false as const, error: error instanceof Error ? error.message : fallback }
}

/**
 * A branch id of `null` is the unbranched store pool, which is a real place —
 * so nullable, not optional. An absent field would be indistinguishable from a
 * form that failed to send one.
 */
const outletId = z.string().min(1).nullable()

const transferDraftSchema = z.object({
  fromOutletId: outletId,
  toOutletId: outletId,
  lines: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        // Positive, because a zero-quantity line writes a ledger leg that moves
        // nothing while claiming a transfer happened.
        quantity: z.number().positive('Every line needs a quantity greater than zero'),
      }),
    )
    .min(1, 'A transfer needs at least one ingredient'),
  note: z.string().max(500).optional(),
})

export type StockTransferDraftInput = z.infer<typeof transferDraftSchema>

/**
 * Counts are non-negative rather than positive: zero is how a load that never
 * turned up is closed, and it is the only way, since a sent transfer cannot be
 * cancelled.
 */
const receiptCountsSchema = z.record(
  z.string().min(1),
  z.number().nonnegative('A counted quantity cannot be negative'),
)

export async function createStockTransferAction(
  tenantId: string,
  tenantSlug: string,
  input: StockTransferDraftInput,
) {
  try {
    const draft = transferDraftSchema.parse(input)
    const data = await createTransfer(tenantId, draft)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to create the transfer')
  }
}

export async function sendStockTransferAction(
  tenantId: string,
  tenantSlug: string,
  transferId: string,
) {
  try {
    await sendTransfer(tenantId, transferId)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to send the transfer')
  }
}

/**
 * `counts` is what is physically on the receiving bench, not what the paperwork
 * claims. The difference between the two is the entire reason this step exists.
 */
export async function receiveStockTransferAction(
  tenantId: string,
  tenantSlug: string,
  transferId: string,
  counts: Record<string, number>,
) {
  try {
    const checked = receiptCountsSchema.parse(counts)
    await receiveTransfer(tenantId, transferId, checked)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to record the delivery')
  }
}

export async function cancelStockTransferAction(
  tenantId: string,
  tenantSlug: string,
  transferId: string,
) {
  try {
    await cancelTransfer(tenantId, transferId)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to cancel the transfer')
  }
}

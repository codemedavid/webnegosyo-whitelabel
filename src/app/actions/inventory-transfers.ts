'use server'

/**
 * The server actions a transfer screen calls.
 *
 * Separate from `inventory.ts` deliberately. That file is the stock ledger's
 * surface — record a movement, read a history — and a transfer is a document
 * with a lifecycle of its own; folding four more actions into an already long
 * module would bury the one seam where a branch acts on another branch's stock.
 *
 * Branch authority is answered underneath, in `stock-transfers-service.ts`,
 * against `app_users` — never against anything the client sent. The grant
 * (`inventory`, Phase 0d) is checked HERE, like `/api/inventory/transfers`
 * checks it for the app: the service's cookie variants only delegate to the
 * `...With` variants both doors share (inventory-transfer-client-parity).
 */

/** Moving stock between branches is `inventory`. */
function requireTransferGrant(tenantId: string, action: 'create' | 'edit') {
  return requireGrant(tenantId, 'inventory', action, PERMISSION_REFUSALS.transfers)
}

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PERMISSION_REFUSALS, requireGrant } from '@/lib/inventory/permission-gate'
import {
  createTransfer,
  sendTransfer,
  receiveTransfer,
  cancelTransfer,
} from '@/lib/inventory/stock-transfers-service'
import {
  transferDraftSchema,
  receiptCountsSchema,
  type StockTransferDraftInput,
} from '@/lib/inventory/schemas'

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

// The draft's type lives in `@/lib/inventory/schemas` and is imported from
// there by both doors — here and `/api/inventory/transfers` — so the two cannot
// drift apart. It is deliberately not re-exported: a `'use server'` module may
// only export async functions, and a re-exported binding survives the server
// action transform as a value reference, which throws at import time.
export async function createStockTransferAction(
  tenantId: string,
  tenantSlug: string,
  input: StockTransferDraftInput,
) {
  try {
    await requireTransferGrant(tenantId, 'create')
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
    await requireTransferGrant(tenantId, 'edit')
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
    await requireTransferGrant(tenantId, 'edit')
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
    await requireTransferGrant(tenantId, 'edit')
    await cancelTransfer(tenantId, transferId)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to cancel the transfer')
  }
}

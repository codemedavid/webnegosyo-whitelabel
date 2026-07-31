'use server'

/**
 * The server actions a stock-count screen calls.
 *
 * Separate from `inventory.ts` for the same reason transfers are: that file is
 * the ledger's surface — record a movement, read a history — and a count is a
 * document with a lifecycle of its own.
 *
 * Every authority question is answered underneath, in
 * `count-session-service.ts`, against `app_users` — never against anything the
 * client sent. The tenant is taken from this function's own argument rather
 * than from the input, so a client cannot name another shop's shelf.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { openCount, closeCount } from '@/lib/inventory/count-session-service'

const inventoryPath = (slug: string) => `/${slug}/admin/inventory`

/**
 * A refusal is a message, not a throw.
 *
 * Every message the service surfaces is written for the person reading it —
 * "That stock count is already closed" rather than a constraint name — so
 * passing its own text through is the right answer, and the fallback only
 * covers something unplanned.
 */
function fail(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return { success: false as const, error: error.issues[0]?.message ?? fallback }
  }
  return { success: false as const, error: error instanceof Error ? error.message : fallback }
}

/**
 * A branch id of `null` is the unbranched store pool, which is a real place and
 * the one most tenants count every day — so nullable, not optional.
 */
const openCountSchema = z.object({
  outletId: z.string().min(1).nullable(),
  note: z.string().max(500).optional(),
})

export type OpenStockCountInput = z.infer<typeof openCountSchema>

/**
 * Start counting, or join the count already running on that shelf.
 *
 * Returns the session either way — the screen files its stocktakes against the
 * returned id, and a caller that had to distinguish "started" from "joined"
 * would be asking a question the merchant does not have.
 */
export async function openStockCountAction(
  tenantId: string,
  tenantSlug: string,
  input: OpenStockCountInput,
) {
  try {
    const checked = openCountSchema.parse(input)
    const data = await openCount(tenantId, checked)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to open the stock count')
  }
}

/** Declare the count over. What was not reached by now was not counted. */
export async function closeStockCountAction(
  tenantId: string,
  tenantSlug: string,
  countId: string,
) {
  try {
    const checked = z.string().min(1, 'A stock count is required').parse(countId)
    await closeCount(tenantId, checked)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to close the stock count')
  }
}

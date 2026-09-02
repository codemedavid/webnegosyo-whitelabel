import { findPresellViolationMessage } from '@/lib/presell/checkout-guard'
import { applyPresellOrder } from '@/lib/presell/claim'
import { collectPresellLines, type PresellCartLine } from '@/lib/presell/availability'

/**
 * Reserving presell stock for an order, and giving it back.
 *
 * The guard answers "does this cart fit?"; the claim answers "did WE get it?"
 * Two customers can both pass the guard for the last bilao — only the atomic
 * SQL claim (`apply_presell_order`) decides. The claim runs under a server-
 * generated claim id BEFORE the order row exists, so an oversold cart is
 * refused before anything is written, and the id is stored in customer_data
 * so any backend's cancel path can release it.
 */

export interface PresellOrderItem {
  menu_item_id: string
  menu_item_name: string
  quantity: number
  presell_date?: string
}

export type PresellClaimOutcome =
  | { ok: true; lines: PresellCartLine[] }
  | { ok: false; message: string }

type ClaimClient = Parameters<typeof applyPresellOrder>[0]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function formatDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${d}`
}

export async function claimPresellForOrder(
  supabase: ClaimClient,
  tenantId: string,
  claimId: string,
  items: readonly PresellOrderItem[],
): Promise<PresellClaimOutcome> {
  const lines = collectPresellLines(
    items.map((i) => ({ menu_item: { id: i.menu_item_id }, quantity: i.quantity, presell_date: i.presell_date })),
  )
  if (lines.length === 0) return { ok: true, lines: [] }

  // Every line goes through the guard — including ordinary ones, because a
  // presell dish sent WITHOUT a date is exactly what the guard refuses.
  const violation = await findPresellViolationMessage(
    tenantId,
    items.map((i) => ({ menuItemId: i.menu_item_id, quantity: i.quantity, presellDate: i.presell_date })),
  )
  if (violation) return { ok: false, message: violation }

  const result = await applyPresellOrder(supabase, tenantId, claimId, 'sale', lines)
  switch (result.status) {
    case 'applied':
    case 'already_applied':
      return { ok: true, lines }
    case 'shortfall': {
      const name = items.find((i) => i.menu_item_id === result.menuItemId)?.menu_item_name ?? 'An item'
      return {
        ok: false,
        message: `${name} just sold out for ${formatDate(result.presellDate)}. Please adjust your cart and try again.`,
      }
    }
    case 'error':
      console.error('[presell] Claim failed', tenantId, claimId, result.message)
      return { ok: false, message: 'We could not reserve your pre-order. Please try again in a moment.' }
  }
}

/** Best-effort: a cancellation is already saved and must never be undone by a stock write. */
export async function releasePresellForOrder(
  supabase: ClaimClient,
  tenantId: string,
  claimId: string,
  lines: readonly PresellCartLine[],
): Promise<void> {
  try {
    const result = await applyPresellOrder(supabase, tenantId, claimId, 'void', lines)
    if (result.status === 'error') {
      console.error('[presell] Release failed', tenantId, claimId, result.message)
    }
  } catch (error) {
    console.error('[presell] Release threw', tenantId, claimId, error)
  }
}

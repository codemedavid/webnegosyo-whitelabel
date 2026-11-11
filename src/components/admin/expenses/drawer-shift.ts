/**
 * Whether a drawer expense's shift is still open, read as the signed-in
 * caller (RLS decides). Voiding a drawer expense puts the cash back in that
 * drawer, which the database only allows while the shift is open; a closed
 * shift's expense can only be re-sorted with Fix.
 *
 * Any read that fails or comes back empty is "unknown": the sheet then offers
 * Void and shows the server's refusal if the shift turns out to be closed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface DrawerShift {
  /** null = couldn't tell. */
  isOpen: boolean | null
  /** "Cashier 1", or null when the shift has no drawer name. */
  drawerName: string | null
}

export const UNKNOWN_SHIFT: DrawerShift = { isOpen: null, drawerName: null }

export async function readDrawerShift(db: SupabaseClient, movementId: string): Promise<DrawerShift> {
  try {
    const movement = await db.from('shift_cash_movements').select('shift_id').eq('id', movementId).maybeSingle()
    const shiftId = (movement.data as { shift_id?: string } | null)?.shift_id
    if (movement.error || !shiftId) return UNKNOWN_SHIFT
    const shift = await db.from('staff_shifts').select('status, drawer_name').eq('id', shiftId).maybeSingle()
    const row = shift.data as { status?: string; drawer_name?: string | null } | null
    if (shift.error || !row) return UNKNOWN_SHIFT
    return {
      isOpen: row.status === 'open' ? true : row.status === 'closed' ? false : null,
      drawerName: row.drawer_name?.trim() || null,
    }
  } catch {
    return UNKNOWN_SHIFT
  }
}

/** "Voiding puts ₱1,250 back in Cashier 1’s drawer." */
export function voidHelperText(amountText: string, drawerName: string | null): string {
  return drawerName ? `Voiding puts ${amountText} back in ${drawerName}’s drawer.` : `Voiding puts ${amountText} back in the cashier’s drawer.`
}

/**
 * "Take from a cashier's drawer": the open drawers the caller may pay an
 * expense from, read through the CALLER's session (RLS bounds it to the
 * branches they reach).
 *
 * Mirrors the drawer's own rule so the form never offers a drawer the save
 * would be refused from: your own open shift, and — for someone who manages
 * cash (owner, full access, cash_manage) — every other open drawer you reach.
 * `record_drawer_expense` still decides.
 *
 * Bounded: open shifts of one store only (`idx_staff_shifts_tenant_opened`),
 * at most `MAX_OPEN_DRAWERS`.
 */

import type { ExpenseDb } from './expenses-read'
import type { PayableDrawer } from '../types'

export const MAX_OPEN_DRAWERS = 50

interface OpenShiftRow {
  id: string
  outlet_id: string | null
  staff_user_id: string | null
  staff_name: string | null
  drawer_name: string | null
  opened_at: string
}

export interface PayableDrawersQuery {
  tenantId: string
  userId: string
  managesCash: boolean
}

export function toPayableDrawers(rows: readonly OpenShiftRow[], query: Pick<PayableDrawersQuery, 'userId' | 'managesCash'>): PayableDrawer[] {
  const drawers = rows
    .map((row) => ({
      shiftId: row.id,
      drawerName: row.drawer_name?.trim() || null,
      staffName: row.staff_name?.trim() || 'Staff',
      isMine: row.staff_user_id === query.userId,
      outletId: row.outlet_id,
      openedAt: row.opened_at,
    }))
    .filter((drawer) => drawer.isMine || query.managesCash)
  return [...drawers].sort(byMineThenTill)
}

/** Mine first, then tills by name ("Cashier 1" before "Cashier 2"), then personal drawers by holder. */
function byMineThenTill(a: PayableDrawer, b: PayableDrawer): number {
  if (a.isMine !== b.isMine) return a.isMine ? -1 : 1
  if (a.drawerName && b.drawerName) {
    return a.drawerName.localeCompare(b.drawerName, undefined, { numeric: true }) || a.staffName.localeCompare(b.staffName)
  }
  if (a.drawerName || b.drawerName) return a.drawerName ? -1 : 1
  return a.staffName.localeCompare(b.staffName)
}

export async function listPayableDrawers(db: ExpenseDb, query: PayableDrawersQuery): Promise<PayableDrawer[]> {
  let request = db
    .from('staff_shifts')
    .select('id, outlet_id, staff_user_id, staff_name, drawer_name, opened_at')
    .eq('tenant_id', query.tenantId)
    .eq('status', 'open')
  // Without cash management only your own drawer is offered: read only that.
  if (!query.managesCash) request = request.eq('staff_user_id', query.userId)
  const { data, error } = await request.order('opened_at', { ascending: true }).limit(MAX_OPEN_DRAWERS)
  if (error) throw new Error(error.message)
  return toPayableDrawers((data ?? []) as OpenShiftRow[], query)
}

/** "Cashier 1 · Ana", "Your drawer", "Ana's drawer" (a personal drawer). */
export function payableDrawerLabel(drawer: Pick<PayableDrawer, 'drawerName' | 'staffName' | 'isMine'>): string {
  if (drawer.isMine) return drawer.drawerName ? `${drawer.drawerName} · You` : 'Your drawer'
  return drawer.drawerName ? `${drawer.drawerName} · ${drawer.staffName}` : `${drawer.staffName}'s drawer`
}

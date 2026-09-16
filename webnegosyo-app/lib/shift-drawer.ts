/**
 * Which sales belong to ONE person's drawer.
 *
 * pos-sales.ts answers the day; this answers the shift. A sale belongs to a
 * shift's drawer only when the register stamped this cashier onto it
 * (customerData.pos.cashierId, written by buildPosOrder) AND it was rung
 * inside the shift's window. An online order never touches the drawer, an
 * unattributed sale cannot be pinned on anyone, and a cancelled sale's money
 * was never held — all three are dropped, because understating one drawer is
 * safer than charging a cashier for money they never took.
 *
 * Deliberately DERIVED (cashier + window) rather than a shift id stamped on
 * orders: orders live in Convex or platform Supabase depending on the
 * tenant, and a derived attribution works identically on both, including for
 * every sale rung before shifts existed.
 *
 * Pure and side-effect free; the screen fetches, this decides.
 */

import { getOrderOutletId } from "./branch-scope";
import { readPosPayment } from "./pos-order";
import {
  summarizeCounterSales,
  type CounterPayment,
  type CounterSale,
  type CounterSalesSummary,
} from "./pos-sales";

export interface StaffPayment extends CounterPayment {
  recordedBy?: string;
  _creationTime?: number;
}

/** The window and owner of one drawer. A subset of ShiftRecord on purpose. */
export interface DrawerShift {
  outletId?: string | null;
  staffUserId: string;
  openedAt: string;
  /** Null while the shift is running — the window then ends at `nowMs`. */
  closedAt: string | null;
}

/**
 * Whether one sale belongs to this shift's drawer.
 *
 * Counter sales only: the store-day summary counts confirmed online orders
 * (SourcePolicy), but a PERSONAL drawer must not, or every cashier who taps
 * Confirm inherits money they never held.
 */
function belongsToDrawer(sale: CounterSale, shift: DrawerShift, nowMs: number): boolean {
  if (shift.outletId !== undefined && getOrderOutletId(sale) !== shift.outletId) return false;
  if (sale.status === "cancelled") return false;
  if (sale.source !== "pos") return false;

  const cashierId = readPosPayment(sale.customerData)?.cashierId;
  if (!cashierId || cashierId !== shift.staffUserId) return false;

  const windowEnd = shift.closedAt === null ? nowMs : Date.parse(shift.closedAt);
  return sale._creationTime >= Date.parse(shift.openedAt) && sale._creationTime <= windowEnd;
}

/**
 * The sales this shift's drawer answers for, in the order they were given.
 *
 * Exported for the same reason as selectShiftSales: the list a cashier reads
 * and the totals they reconcile against must be one decision made once.
 */
export function selectShiftDrawerSales(
  orders: readonly CounterSale[],
  shift: DrawerShift,
  nowMs: number,
): CounterSale[] {
  return orders.filter((sale) => belongsToDrawer(sale, shift, nowMs));
}

/**
 * The drawer's totals, with the SAME arithmetic as the day summary —
 * settlement rows override the sale's single payment method, refunds are
 * netted and reported, centavos round once. `cashTotal` is the
 * `cashCollected` that reconcileShift expects.
 */
export function summarizeShiftDrawer(
  orders: readonly CounterSale[],
  payments: readonly StaffPayment[],
  shift: DrawerShift,
  nowMs: number,
): CounterSalesSummary {
  const windowStart = Date.parse(shift.openedAt);
  const windowEnd = shift.closedAt === null ? nowMs : Date.parse(shift.closedAt);
  const includedPayments: StaffPayment[] = [];
  const sales: CounterSale[] = [];
  for (const order of orders) {
    if (shift.outletId !== undefined && getOrderOutletId(order) !== shift.outletId) continue;
    const ledger = payments.filter(payment => payment.orderId === order._id);
    if (ledger.length === 0) {
      if (belongsToDrawer(order, shift, nowMs)) sales.push(order);
      continue;
    }
    // A later collection belongs to the person who handled that money, even
    // when another cashier rang up the original bill in an earlier shift.
    const own = ledger.filter(payment => {
      const actor = payment.recordedBy ?? readPosPayment(order.customerData)?.cashierId;
      const at = payment._creationTime ?? order._creationTime;
      return actor === shift.staffUserId && at >= windowStart && at <= windowEnd;
    });
    if (own.length === 0) continue;
    includedPayments.push(...own);
    // Actual ledger movements also matter on cancelled or online orders.
    sales.push({ ...order, source: "pos", status: "delivered" });
  }
  return summarizeCounterSales(sales, includedPayments);
}

/**
 * Which orders "Combine another order" offers: still owing, not cancelled, not
 * on the bill already. The bill's own table comes first (the second round that
 * was rung under another name), then the newest.
 */
import { isOrderUnpaid } from "../order-paid-state";
import { getOrderTableNumber } from "../order-table-number";

export interface CandidateSource {
  _id: string;
  _creationTime: number;
  dailyNumber?: number | null;
  customerName: string;
  status: string;
  total: number;
  paymentStatus?: string | null;
  amountPaid?: number | null;
  customerData?: unknown;
}

export type BillCandidate<O extends CandidateSource = CandidateSource> = O & { table: string | null };

export const MAX_CANDIDATES = 40;

export function billCandidates<O extends CandidateSource>(
  orders: readonly O[],
  { onBill, table }: { onBill: readonly string[]; table: string | null },
): BillCandidate<O>[] {
  return orders
    .filter((order) => order.status !== "cancelled" && !onBill.includes(order._id))
    .filter((order) =>
      isOrderUnpaid({
        status: order.status,
        customerData: order.customerData,
        paymentStatus: order.paymentStatus ?? "pending",
        total: order.total,
        amountPaid: order.amountPaid,
      }),
    )
    .map((order) => ({ ...order, table: getOrderTableNumber(order.customerData) }))
    .sort((a, b) => {
      const aHere = table !== null && a.table === table ? 0 : 1;
      const bHere = table !== null && b.table === table ? 0 : 1;
      return aHere - bHere || b._creationTime - a._creationTime;
    })
    .slice(0, MAX_CANDIDATES);
}

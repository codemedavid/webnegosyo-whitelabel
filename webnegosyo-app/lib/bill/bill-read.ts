/**
 * From what the bill screen loaded for one order to a `BillOrder`.
 *
 * Paid is read from BOTH records, as everywhere else (`order-paid-state`): an
 * order settled by its status counts as paid in full even with an empty
 * ledger. A ledger that could not be read makes the order unbillable rather
 * than unpaid, because "unpaid" would ask a customer to pay twice.
 */
import type { LedgerState } from "../order-ledger";
import { isOrderUnpaid } from "../order-paid-state";
import { summarizeSettlement, type OrderPaymentLike } from "../order-history-view";
import type { BillItem, BillOrder } from "./bill-orders";

export interface BillOrderSource {
  _id: string;
  _creationTime: number;
  dailyNumber?: number | null;
  outlet_id?: string | null;
  outletId?: string | null;
  customerName: string;
  customerContact: string;
  customerData?: Record<string, unknown>;
  status: string;
  orderType?: string;
  paymentStatus?: string | null;
  total: number;
  deliveryFee?: number;
  serviceCharge?: number;
  discount_data?: unknown;
  items?: Omit<BillItem, "orderId">[];
}

export function billOrderFromRead(
  detail: BillOrderSource,
  payments: readonly OrderPaymentLike[] | undefined,
  ledger: LedgerState,
): BillOrder | null {
  if (ledger === "unavailable") return null;
  if (ledger === "available" && payments === undefined) return null;

  const ledgerPaid = ledger === "available" ? summarizeSettlement(detail.total, payments ?? []).amountPaid : 0;
  const isUnpaid = isOrderUnpaid({
    status: detail.status,
    customerData: detail.customerData,
    paymentStatus: detail.paymentStatus ?? "pending",
    total: detail.total,
    amountPaid: ledgerPaid,
  });

  return {
    _id: detail._id,
    _creationTime: detail._creationTime,
    dailyNumber: detail.dailyNumber,
    outlet_id: detail.outlet_id,
    outletId: detail.outletId,
    customerName: detail.customerName,
    customerContact: detail.customerContact,
    orderType: detail.orderType,
    status: detail.status,
    paymentStatus: detail.paymentStatus,
    total: detail.total,
    deliveryFee: detail.deliveryFee,
    serviceCharge: detail.serviceCharge,
    customerData: detail.customerData,
    discount_data: detail.discount_data,
    items: (detail.items ?? []).map((item) => ({ ...item, orderId: detail._id })),
    amountPaid: isUnpaid ? Math.min(ledgerPaid, detail.total) : detail.total,
  };
}

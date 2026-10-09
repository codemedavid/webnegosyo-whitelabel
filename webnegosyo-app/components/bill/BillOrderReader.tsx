import { useEffect, useMemo } from "react";
import type { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { resolveLedgerState, type LedgerState } from "../../lib/order-ledger";
import { recallOrder, useOfflineOrderDetail } from "../../lib/offline/use-offline-orders";
import type { OrderPaymentLike } from "../../lib/order-history-view";
import type { BillItem } from "../../lib/bill/bill-orders";

const getOrderByIdRef = "orders:getOrderById" as unknown as FunctionReference<"query">;
const getOrderPaymentsRef = "orders:getOrderPayments" as unknown as FunctionReference<"query">;

/** The slice of `orders:getOrderById` a bill reads. */
export interface BillOrderDetail {
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
  total: number;
  deliveryFee?: number;
  serviceCharge?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  discount_data?: unknown;
  items?: Omit<BillItem, "orderId">[];
}

export interface BillOrderRead {
  order: BillOrderDetail | null | undefined;
  payments: OrderPaymentLike[] | undefined;
  ledger: LedgerState;
  error: string | null;
}

/**
 * Reads one order of a bill the way the order screen does — with this
 * device's offline edits and the payments it has taken but not yet sent —
 * and reports it up. Renders nothing; hooks cannot run in a loop, so the bill
 * mounts one of these per order.
 */
export function BillOrderReader({
  orderId,
  onRead,
}: {
  orderId: string;
  onRead: (orderId: string, read: BillOrderRead) => void;
}) {
  const offline = useOfflineOrderDetail(orderId);
  const args = offline.isDeviceOnly ? "skip" : { orderId: offline.serverOrderId };
  const { data: serverOrder, error } = useSafeQuery<BillOrderDetail | null>(getOrderByIdRef, args);
  const { data: serverPayments, error: paymentsError } = useSafeQuery<OrderPaymentLike[]>(
    getOrderPaymentsRef,
    args,
  );

  // Memoized: the effect below reports these up, and a fresh object on every
  // render would re-render the bill, which re-renders this, forever.
  const order = useMemo(() => {
    if (serverOrder) return offline.withEdits(serverOrder);
    if (offline.localOrder) return offline.localOrder as unknown as BillOrderDetail;
    if (error) return recallOrder<BillOrderDetail>(offline.serverOrderId) ?? serverOrder;
    return serverOrder;
  }, [serverOrder, offline, error]);
  const payments = useMemo(() => {
    if (offline.isDeviceOnly) return offline.pendingPayments;
    return serverPayments ? [...serverPayments, ...offline.pendingPayments] : undefined;
  }, [serverPayments, offline]);
  const ledger = offline.isDeviceOnly ? "available" : resolveLedgerState(paymentsError);
  const readError = order ? null : error;

  useEffect(() => {
    onRead(orderId, { order, payments, ledger, error: readError });
  }, [orderId, order, payments, ledger, readError, onRead]);

  return null;
}

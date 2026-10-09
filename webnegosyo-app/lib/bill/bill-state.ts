/**
 * The bill screen's state, worked out from what it has read. Pure.
 */
import type { BranchScope } from "../branch-scope";
import { canCollectPayment, type CollectGate } from "../order-collect";
import type { OrderBackend } from "../order-backend";
import type { LedgerState } from "../order-ledger";
import type { OrderPaymentLike } from "../order-history-view";
import type { StaffPermissionHolder } from "../staff-permissions";
import { DEMO_READONLY_MESSAGE } from "../demo";
import { orderOwed, type BillOrder } from "./bill-orders";
import { billOrderFromRead, type BillOrderSource } from "./bill-read";

export interface BillOrderReadLike {
  order: BillOrderSource | null | undefined;
  payments: readonly OrderPaymentLike[] | undefined;
  ledger: LedgerState;
  error: string | null;
}

export type BillState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; orders: BillOrder[] };

const LEDGER_UNREADABLE =
  "This bill's payment history could not be loaded, so it cannot be split or collected safely. Check the connection and try again.";

/** `?orders=a,b` — tolerant of blanks, repeats and an array param. */
export function parseBillOrderIds(param: string | string[] | undefined): string[] {
  const raw = Array.isArray(param) ? param.join(",") : param ?? "";
  return [...new Set(raw.split(",").map((id) => id.trim()).filter((id) => id !== ""))];
}

export function resolveBill(orderIds: readonly string[], reads: Readonly<Record<string, BillOrderReadLike>>): BillState {
  const orders: BillOrder[] = [];
  for (const id of orderIds) {
    const read = reads[id];
    if (!read) return { status: "loading" };
    if (read.error && !read.order) return { status: "error", message: read.error };
    if (read.ledger === "unavailable") return { status: "error", message: LEDGER_UNREADABLE };
    if (read.order === null) return { status: "error", message: "One of these orders could not be found." };
    if (!read.order) return { status: "loading" };
    const order = billOrderFromRead(read.order, read.payments, read.ledger);
    if (!order) return { status: "loading" };
    orders.push(order);
  }
  return { status: "ready", orders };
}

export interface BillGateInput {
  orders: readonly BillOrder[];
  ledgers: Readonly<Record<string, LedgerState>>;
  backend: OrderBackend;
  user: StaffPermissionHolder;
  scope?: BranchScope;
  isDemo: boolean;
}

/** May money be taken on this bill? Every order that still owes must allow it. */
export function billCollectGate({ orders, ledgers, backend, user, scope, isDemo }: BillGateInput): CollectGate {
  if (isDemo) return { allowed: false, reason: DEMO_READONLY_MESSAGE };
  const owing = orders.filter((order) => orderOwed(order) > 0);
  if (owing.length === 0) return { allowed: false, reason: "This bill is fully paid." };
  for (const order of owing) {
    const gate = canCollectPayment({
      status: order.status,
      backend,
      user,
      balance: orderOwed(order),
      ledger: ledgers[order._id] ?? "unavailable",
      scope,
      order,
    });
    if (!gate.allowed) return gate;
  }
  return { allowed: true };
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { FunctionReference } from "convex/server";
import { useRefRoute, useSafeQuery } from "../lib/hooks";
import { ORDER_LEDGER_LIMIT, TRUNCATED_LEDGER_MESSAGE } from "../lib/backends/supabase-adapter";
import type { StaffPayment } from "../lib/shift-drawer";
export type { StaffPayment } from "../lib/shift-drawer";

interface LedgerRead { data?: StaffPayment[]; error: string | null }

const perOrderRef = "orders:getOrderPayments" as unknown as FunctionReference<"query">;
const bulkRef = "orders:getOrderPaymentsForOrders" as unknown as FunctionReference<"query">;

const MISSING_FUNCTION_MESSAGE = "Update this store's backend to read settlement history.";
const TRUNCATED_MESSAGE = TRUNCATED_LEDGER_MESSAGE;

/** Whether any one order's ledger reached the per-order ceiling and may be cut short. */
function hasTruncatedLedger(payments: readonly StaffPayment[]): boolean {
  const counts = new Map<string, number>();
  for (const payment of payments) {
    counts.set(payment.orderId, (counts.get(payment.orderId) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count >= ORDER_LEDGER_LIMIT);
}

function OrderLedger({ id, report }: { id: string; report: (id: string, read: LedgerRead) => void }) {
  const { data, error, isMissingFunction } = useSafeQuery<StaffPayment[]>(perOrderRef, { orderId: id });
  useEffect(() => {
    report(id, { data, error: error ?? (isMissingFunction ? MISSING_FUNCTION_MESSAGE :
      (data?.length ?? 0) >= ORDER_LEDGER_LIMIT ? TRUNCATED_MESSAGE : null) });
  }, [id, data, error, isMissingFunction, report]);
  return null;
}

type ReaderChildren = (payments: StaffPayment[], ready: boolean, error: string | null) => React.ReactNode;

/**
 * Convex is a live subscription with nothing to poll, and its deployed bundles
 * answer the per-order read today; one read per order costs nothing there.
 */
function PerOrderReader({ ids, children }: { ids: readonly string[]; children: ReaderChildren }) {
  const [reads, setReads] = useState<Record<string, LedgerRead>>({});
  const report = useCallback((id: string, read: LedgerRead) => {
    setReads(previous => ({ ...previous, [id]: read }));
  }, []);
  const error = ids.map(id => reads[id]?.error).find(Boolean) ?? null;
  const ready = !error && ids.every(id => reads[id]?.data !== undefined);
  const payments = ids.flatMap(id => reads[id]?.data ?? []);
  return <>{ids.map(id => <OrderLedger key={id} id={id} report={report} />)}{children(payments, ready, error)}</>;
}

/**
 * Subscribe through the same authenticated, tenant-scoped query path as order
 * detail.
 *
 * On the platform backend every read polls, so one read per order made a
 * 200-sale shift 200 polling requests — the busiest endpoint of the 2026-09-20
 * saturation. The platform now answers every order's ledger in one read; the
 * bulk read is asked for unconditionally (hooks cannot be conditional) and
 * skipped on any other backend.
 */
export function OrderSettlementReader({ ids, children }: {
  ids: readonly string[];
  children: ReaderChildren;
}) {
  const isBulk = useRefRoute("orders:getOrderPaymentsForOrders") === "platform";
  const orderIds = useMemo(() => [...ids], [ids]);
  const bulk = useSafeQuery<StaffPayment[]>(bulkRef, isBulk ? { orderIds } : "skip");

  if (!isBulk) return <PerOrderReader ids={ids}>{children}</PerOrderReader>;

  const payments = bulk.data ?? [];
  const error =
    bulk.error ??
    (bulk.isMissingFunction ? MISSING_FUNCTION_MESSAGE : hasTruncatedLedger(payments) ? TRUNCATED_MESSAGE : null);
  const ready = !error && bulk.data !== undefined;
  return <>{children(payments, ready, error)}</>;
}

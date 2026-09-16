import React, { useCallback, useEffect, useState } from "react";
import type { FunctionReference } from "convex/server";
import { useSafeQuery } from "../lib/hooks";
import { ORDER_LEDGER_LIMIT } from "../lib/backends/supabase-adapter";
import type { StaffPayment } from "../lib/shift-drawer";
export type { StaffPayment } from "../lib/shift-drawer";

interface LedgerRead { data?: StaffPayment[]; error: string | null }
const ref = "orders:getOrderPayments" as unknown as FunctionReference<"query">;

function OrderLedger({ id, report }: { id: string; report: (id: string, read: LedgerRead) => void }) {
  const { data, error, isMissingFunction } = useSafeQuery<StaffPayment[]>(ref, { orderId: id });
  useEffect(() => {
    report(id, { data, error: error ?? (isMissingFunction ? "Update this store's backend to read settlement history." :
      (data?.length ?? 0) >= ORDER_LEDGER_LIMIT ? "Settlement history may be incomplete. This drawer cannot be reconciled safely." : null) });
  }, [id, data, error, isMissingFunction, report]);
  return null;
}

/** Subscribe through the same authenticated, tenant-scoped query path as order detail. */
export function OrderSettlementReader({ ids, children }: {
  ids: readonly string[];
  children: (payments: StaffPayment[], ready: boolean, error: string | null) => React.ReactNode;
}) {
  const [reads, setReads] = useState<Record<string, LedgerRead>>({});
  const report = useCallback((id: string, read: LedgerRead) => {
    setReads(previous => ({ ...previous, [id]: read }));
  }, []);
  const error = ids.map(id => reads[id]?.error).find(Boolean) ?? null;
  const ready = !error && ids.every(id => reads[id]?.data !== undefined);
  const payments = ids.flatMap(id => reads[id]?.data ?? []);
  return <>{ids.map(id => <OrderLedger key={id} id={id} report={report} />)}{children(payments, ready, error)}</>;
}

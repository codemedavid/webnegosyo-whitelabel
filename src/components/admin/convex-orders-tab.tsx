"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Owl } from "@/components/mascot/owl";
import { useConvexOrders, useUpdateConvexOrderStatus } from "@/hooks/use-convex-orders";
import { scopeOrderRows } from "@/lib/outlets/branch-scope-query";
import type { BranchScope } from "@/lib/outlets/branch-scope";
import {
  listOrderOutlets,
  matchesOutletFilter,
  OUTLET_FILTER_ALL,
} from "@/lib/outlets/order-outlet-display";
import { notifyConvexLifecycleSync } from "@/lib/customers/web-lifecycle-sync";
import { parseOrderSearch } from "@/lib/admin/orders-table/filters";
import { formatDailyOrderNumber } from "@/lib/order-number";
import { convexOrderRow, type OrdersTableRow } from "@/lib/admin/orders-table/row-model";
import { STATUS_META, type NextStatusStep, type OrderStatus } from "@/lib/admin/orders-table/status";
import { ConvexOrderSheet } from "@/components/admin/convex-order-sheet";
import { OrdersTable } from "@/components/admin/orders-table/orders-table";
import { OrdersToolbar } from "@/components/admin/orders-table/orders-toolbar";
import { StatusTabs } from "@/components/admin/orders-table/status-tabs";

interface ConvexOrdersTabProps {
  /** Passed down so cancelling an order can restore its stock. */
  tenantId?: string;
  /** Whether the store has Lalamove, so the order sheet can offer a rider. */
  lalamoveEnabled?: boolean;
  /**
   * The branch this admin may see. Convex has no index on the branch — it
   * lives in the `customerData` blob — so the rows are narrowed here after the
   * query rather than inside it. That inherits the query's existing row
   * ceiling: a branch on a very busy store can fall off the end of the window.
   */
  scope?: BranchScope;
}

type ConvexOrderDoc = Record<string, unknown>;

/** Search over the loaded rows: name, phone, or the daily number. */
function matchesSearch(row: OrdersTableRow, raw: string): boolean {
  const { text, orderNumber } = parseOrderSearch(raw);
  if (!text && orderNumber === null) return true;
  if (orderNumber !== null && row.numberLabel === formatDailyOrderNumber(orderNumber)) return true;
  const needle = text.toLowerCase();
  return Boolean(needle) && (row.customerName.toLowerCase().includes(needle) || (row.customerContact ?? "").toLowerCase().includes(needle));
}

/**
 * The Orders table for a store whose orders live in Convex. Same table, tabs
 * and words as the platform view; what Convex cannot do is said plainly:
 * `orders:getOrders` returns the newest 50 per status and older deployments
 * take no date range, so filters apply to those rows and there are no pages.
 */
export function ConvexOrdersTab({ tenantId, scope, lalamoveEnabled }: ConvexOrdersTabProps) {
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loaded = useConvexOrders(status === "all" ? undefined : status) as ConvexOrderDoc[] | undefined;
  const updateStatus = useUpdateConvexOrderStatus();

  // `undefined` means the query has not resolved; keep it distinct from empty.
  const docs = useMemo(
    () => (loaded === undefined ? undefined : scope ? scopeOrderRows(loaded, scope) : loaded),
    [loaded, scope],
  );

  const outlets = useMemo(() => (docs ? listOrderOutlets(docs) : []), [docs]);
  const typeOptions = useMemo(() => {
    const names = new Set((docs ?? []).map((doc) => (typeof doc.orderType === "string" ? doc.orderType.trim() : "")).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }));
  }, [docs]);

  const rows = useMemo(() => {
    if (!docs) return [];
    return docs
      .filter((doc) => !type || doc.orderType === type)
      .filter((doc) => matchesOutletFilter(doc, branch ?? OUTLET_FILTER_ALL))
      .map(convexOrderRow)
      .filter((row) => matchesSearch(row, search));
  }, [docs, type, branch, search]);

  async function advance(row: OrdersTableRow, step: NextStatusStep) {
    setBusyIds((current) => new Set(current).add(row.id));
    try {
      await updateStatus({ orderId: row.id, status: step.status });
      // Convex holds the order; the platform holds the customer ledger loyalty
      // earns from. Nothing else in the browser tells it this order moved.
      void notifyConvexLifecycleSync({ tenantId, externalOrderId: row.id, status: step.status });
      toast.success(`Order ${row.numberLabel} · ${STATUS_META[step.status].label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not update order ${row.numberLabel}`);
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  }

  const isFiltered = Boolean(search.trim() || type || branch);

  return (
    <div className="flex flex-col gap-4">
      <StatusTabs value={status} counts={null} onSelect={setStatus} />

      <OrdersToolbar
        search={search}
        onSearch={setSearch}
        type={type}
        typeOptions={typeOptions}
        onType={setType}
        branch={branch}
        branchOptions={outlets.map((outlet) => ({ value: outlet.id, label: outlet.name }))}
        onBranch={setBranch}
        onClear={
          isFiltered
            ? () => {
                setSearch("");
                setType(null);
                setBranch(null);
              }
            : undefined
        }
      />

      {docs === undefined ? (
        <div className="flex justify-center rounded-2xl bg-white py-20 ring-1 ring-border">
          <Loader2 aria-label="Loading orders" className="size-7 animate-spin text-wn-stone" />
        </div>
      ) : (
        <OrdersTable
          rows={rows}
          nowMs={nowMs}
          onOpen={setSelectedOrderId}
          onAdvance={(row, step) => void advance(row, step)}
          selectedId={selectedOrderId}
          busyIds={busyIds}
          hasItemNames={false}
          caption="Latest orders. Select an order to open it."
          empty={
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <Owl state="waiting" size={96} />
              <p className="text-[16px] font-bold text-wn-ink">{isFiltered || status !== "all" ? "No orders match" : "No orders yet"}</p>
              <p className="max-w-sm text-[14px] text-wn-stone">New orders appear here the moment they come in.</p>
            </div>
          }
        />
      )}

      {docs !== undefined && docs.length > 0 && (
        <p className="text-[13px] text-wn-stone">
          Showing the latest {docs.length} {status === "all" ? "" : `${STATUS_META[status].label.toLowerCase()} `}orders
          {isFiltered && `, ${rows.length} match`}.
        </p>
      )}

      <ConvexOrderSheet
        orderId={selectedOrderId}
        open={selectedOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
        tenantId={tenantId}
        lalamoveEnabled={lalamoveEnabled}
      />
    </div>
  );
}

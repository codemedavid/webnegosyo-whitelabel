import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { View, StyleSheet, FlatList, Alert, RefreshControl, type ListRenderItem } from "react-native";
import { FunctionReference } from "convex/server";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeQuery, useSafeMutation } from "../../lib/hooks";
import { filterOrdersToScope } from "../../lib/branch-scope";
import {
  ORDER_BRANCH_FILTER_ALL,
  ORDER_BRANCH_FILTER_UNASSIGNED,
  filterOrdersToBranchFilter,
  hasUnassignedOrders,
  listOrderBranchOptions,
} from "../../lib/order-branch-filter";
import { useBranchScope } from "../../lib/use-branch-scope";
import { colors, spacing } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { OrderListRow, type OrderListRowOrder } from "../../components/OrderListRow";
import { OrderFilterBar, type SortOrder, type StatusFilterOption } from "../../components/OrderFilterBar";
import { TickerProvider } from "../../components/TickerProvider";
import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { restoreStockForStatusChange } from "../../lib/order-cancel-stock";
import { pushConfirmedOrderToLoyverse } from "../../lib/loyverse-confirm";
// Rendered by <ScreenHeader>; the import stays so the guardrail that every
// tab is escapable keeps reading it here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { ScreenHeader } from "../../components/ScreenHeader";
import { IconButton } from "../../components/IconButton";
import { ExportSheet } from "../../components/ExportSheet";
import { runOrdersExport } from "../../lib/export/run-export";
import { formatExportDay } from "../../lib/export/dates";
import type { ExportOrderItemInput } from "../../lib/export/orders-export";
import type { DateRangePreset } from "../../lib/product-analytics-filters";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { useOptimisticOrderCache } from "../../lib/query/optimistic-order-status";
import { claimOrderBusy, releaseOrderBusy, resolveExportSource } from "../../lib/orders-list-actions";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getAllOrderItemsRef = "orders:getAllOrderItems" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

/** Same bounded page the analytics reads use — getOrders defaults to 50. */
const EXPORT_FETCH_LIMIT = 2000;

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";
type FilterKey = OrderStatus | "all";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
};

const STATUS_FILTERS: FilterKey[] = [
  "all",
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
];

interface ConvexOrder extends OrderListRowOrder {
  customerContact: string;
  status: OrderStatus;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const keyExtractor = (order: ConvexOrder) => order._id;

export default function OrdersScreen() {
  const params = useLocalSearchParams<{ status?: string }>();
  const [filter, setFilter] = useState<FilterKey>(
    STATUS_FILTERS.includes(params.status as FilterKey) ? (params.status as FilterKey) : "all"
  );
  const [sort, setSort] = useState<SortOrder>("newest");
  const [branchFilter, setBranchFilter] = useState<string>(ORDER_BRANCH_FILTER_ALL);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Deep link from the dashboard pipeline (`/orders?status=preparing`). The tab
  // stays mounted, so sync the filter whenever the param changes.
  useEffect(() => {
    if (params.status && STATUS_FILTERS.includes(params.status as FilterKey)) {
      setFilter(params.status as FilterKey);
    }
  }, [params.status]);

  // Fetch the full recent queue once, then filter/search/sort on the client so
  // every status pill can show a live count without extra round-trips.
  const { data: orders, isLoading, error, refetch: refetchOrders } =
    useSafeQuery<ConvexOrder[]>(getOrdersRef, {});
  const scope = useBranchScope();

  // Export state. The deeper reads (a 2000-order page plus every line item)
  // are mounted only while the sheet is open, so the queue screen itself
  // never pays for them.
  const [isExportOpen, setExportOpen] = useState(false);
  const [isExporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { data: exportOrders, refetch: refetchExportOrders } = useSafeQuery<ConvexOrder[]>(
    getOrdersRef,
    isExportOpen ? { limit: EXPORT_FETCH_LIMIT } : "skip"
  );
  const { data: exportItems, refetch: refetchExportItems } = useSafeQuery<ExportOrderItemInput[]>(
    getAllOrderItemsRef,
    isExportOpen ? {} : "skip"
  );
  const updateStatus = useSafeMutation(updateOrderStatusRef);
  const { patchOrderStatus } = useOptimisticOrderCache();

  // Pull-to-refresh re-reads every query this screen holds (the export reads
  // are no-ops while the sheet is closed).
  const onRefresh = useCallback(
    () =>
      refreshWithMinSpinner([refetchOrders, refetchExportOrders, refetchExportItems], setRefreshing),
    [refetchOrders, refetchExportOrders, refetchExportItems]
  );

  // A branch account sees only its own branch's orders. Filtering here — before
  // the counts, search and sort are computed — keeps the status pill counts
  // describing the same list the merchant is looking at.
  const scopedOrders = useMemo(
    () => filterOrdersToScope(scope, orders) as ConvexOrder[],
    [scope, orders],
  );

  /**
   * Branch pills, offered only to an account that can see the whole store — a
   * branch account is already looking at one branch and has nothing to narrow.
   * "Unassigned" appears only when such orders exist, so a merchant whose
   * attribution is healthy is not shown an empty question.
   */
  const branchFilters: StatusFilterOption[] = useMemo(() => {
    if (scope.kind !== "all") return [];
    const options = listOrderBranchOptions(scopedOrders);
    if (options.length === 0) return [];

    const rows: StatusFilterOption[] = [
      { key: ORDER_BRANCH_FILTER_ALL, label: "All branches", count: scopedOrders.length },
      ...options.map((option) => ({
        key: option.id,
        label: option.name,
        count: filterOrdersToBranchFilter(option.id, scopedOrders).length,
      })),
    ];

    if (hasUnassignedOrders(scopedOrders)) {
      rows.push({
        key: ORDER_BRANCH_FILTER_UNASSIGNED,
        label: "Unassigned",
        count: filterOrdersToBranchFilter(ORDER_BRANCH_FILTER_UNASSIGNED, scopedOrders).length,
      });
    }

    return rows;
  }, [scope.kind, scopedOrders]);

  // A branch pill the merchant can no longer see must not keep hiding orders.
  const activeBranchFilter =
    branchFilters.some((row) => row.key === branchFilter) ? branchFilter : ORDER_BRANCH_FILTER_ALL;

  // Narrowed BEFORE the status counts are computed, so the pill counts always
  // describe the same list the merchant is looking at.
  const allOrders = useMemo(
    () => filterOrdersToBranchFilter(activeBranchFilter, scopedOrders),
    [activeBranchFilter, scopedOrders],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: allOrders.length };
    for (const order of allOrders) {
      map[order.status] = (map[order.status] ?? 0) + 1;
    }
    return map;
  }, [allOrders]);

  const filterOptions = useMemo<StatusFilterOption[]>(
    () =>
      STATUS_FILTERS.map((key) => ({
        key,
        label: key === "all" ? "All" : capitalize(key),
        count: counts[key] ?? 0,
      })),
    [counts],
  );

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = allOrders.filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      if (!query) return true;
      return (
        order.customerName.toLowerCase().includes(query) ||
        (order.customerContact ?? "").toLowerCase().includes(query)
      );
    });
    return filtered.sort((a, b) =>
      sort === "newest" ? b._creationTime - a._creationTime : a._creationTime - b._creationTime
    );
  }, [allOrders, filter, search, sort]);

  // Orders with a status change in flight. The ref is the gate — two taps in
  // one frame both read the same rendered state — and the state is what the
  // rows render from.
  const busyRef = useRef<ReadonlySet<string>>(new Set());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(busyRef.current);
  const setBusy = useCallback((next: ReadonlySet<string>) => {
    busyRef.current = next;
    setBusyIds(next);
  }, []);

  const handleUpdateStatus = useCallback(
    async (orderId: string, newStatus: OrderStatus) => {
      if (useAuthStore.getState().isDemo) {
        Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
        return;
      }
      const claim = claimOrderBusy(busyRef.current, orderId);
      if (!claim.isClaimed) return;
      setBusy(claim.busy);

      // The row moves at once; a failed write puts it back.
      const rollback = patchOrderStatus(orderId, newStatus);
      try {
        await updateStatus({ orderId, status: newStatus });
        // Put the ingredients back on a cancel — the same shared side-effect
        // the detail screen runs. Never throws, so a stock write cannot make an
        // order un-cancellable from the queue.
        await restoreStockForStatusChange(newStatus, String(orderId));

        // Push the confirmed order into Loyverse — the same shared side-effect
        // the detail screen runs. Only the id travels: this list holds no line
        // items, so the server reads them back out of the order backend.
        if (newStatus === "confirmed") {
          await pushConfirmedOrderToLoyverse(String(orderId));
        }

        // The confirmation receipt prints from GlobalReceiptAutoPrint, which
        // watches the status transition and holds the line items this list
        // does not — no more "open the order to print it" detour.
      } catch {
        rollback();
        Alert.alert("Error", "Failed to update order status");
      } finally {
        setBusy(releaseOrderBusy(busyRef.current, orderId));
      }
    },
    [patchOrderStatus, setBusy, updateStatus],
  );

  const handleExport = async (preset: DateRangePreset) => {
    // Prefer the deep export page; fall back to the queue's own page so the
    // button still works while the bigger read is in flight — reporting the
    // fallback's coverage against the rows it really holds.
    const source = resolveExportSource(exportOrders, orders, EXPORT_FETCH_LIMIT);
    const fetched = filterOrdersToScope(scope, source.orders) as ConvexOrder[];
    setExporting(true);
    setExportError(null);
    try {
      const coverage = await runOrdersExport({
        orders: fetched,
        items: exportItems ?? [],
        preset,
        status: filter === "all" ? undefined : filter,
        nowMs: Date.now(),
        fetchLimit: source.fetchLimit,
      });
      setExportOpen(false);
      if (!coverage.isComplete) {
        Alert.alert(
          "Export shared",
          `The file includes orders since ${formatExportDay(coverage.effectiveStartMs)} only — older orders exceed the fetch limit.`
        );
      }
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleOpen = useCallback((orderId: string) => {
    router.push(`/(main)/order/${orderId}`);
  }, []);

  // The next status is read from the order's current one, so the row never
  // has to hold the transition table.
  const handleAdvance = useCallback(
    (orderId: string) => {
      const order = allOrders.find((candidate) => candidate._id === orderId);
      const nextStatus = order ? NEXT_STATUS[order.status] : undefined;
      if (nextStatus) void handleUpdateStatus(orderId, nextStatus);
    },
    [allOrders, handleUpdateStatus],
  );

  const confirmCancel = useCallback(
    (order: ConvexOrder) => {
      Alert.alert(
        "Cancel this order?",
        "It will be removed from the active queue and excluded from revenue.",
        [
          { text: "Keep Order", style: "cancel" },
          {
            text: "Cancel Order",
            onPress: () => handleUpdateStatus(order._id, "cancelled"),
            style: "destructive",
          },
        ]
      );
    },
    [handleUpdateStatus],
  );

  const renderItem = useCallback<ListRenderItem<ConvexOrder>>(
    ({ item: order }) => {
      const nextStatus = NEXT_STATUS[order.status];
      return (
        <OrderListRow
          order={order}
          nextStatusLabel={nextStatus ? capitalize(nextStatus) : undefined}
          isBusy={busyIds.has(order._id)}
          onOpen={handleOpen}
          onAdvance={handleAdvance}
          onCancel={confirmCancel}
        />
      );
    },
    [busyIds, handleOpen, handleAdvance, confirmCancel],
  );

  const listEmpty = error ? (
    <ErrorState message={error} onRetry={() => void refetchOrders()} />
  ) : isLoading ? (
    <LoadingState message="Loading orders..." />
  ) : (
    <EmptyState message={search ? "No orders match your search" : "No orders found"} />
  );

  return (
    <View style={styles.screen}>
      {/* <ScreenHeader> mounts <WorkspaceSwitcher /> */}
      <ScreenHeader
        title="Orders"
        subtitle={isLoading ? undefined : `${visibleOrders.length} shown`}
        actions={
          <>
            <IconButton
              icon="export"
              label="Export"
              onPress={() => {
                setExportError(null);
                setExportOpen(true);
              }}
            />
            <IconButton
              icon="qr"
              label="Scan QR"
              tone="primary"
              onPress={() => router.push("/(main)/scan")}
            />
          </>
        }
      />

      <OrderFilterBar
        filters={filterOptions}
        activeFilter={filter}
        onFilterChange={(key) => setFilter(key as FilterKey)}
        sort={sort}
        onSortToggle={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
        search={search}
        onSearchChange={setSearch}
        branchFilters={branchFilters}
        activeBranchFilter={activeBranchFilter}
        onBranchFilterChange={setBranchFilter}
      />

      {/* One clock for every card's age and urgency accent, so a tick redraws
          the cards and not the list. */}
      <TickerProvider>
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={error || isLoading ? [] : visibleOrders}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={listEmpty}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      </TickerProvider>

      <ExportSheet
        visible={isExportOpen}
        title={filter === "all" ? "Export orders" : `Export ${filter} orders`}
        isBusy={isExporting}
        errorMessage={exportError}
        onExport={handleExport}
        onClose={() => setExportOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1, marginTop: spacing.md },
  listContent: { padding: spacing.xl, paddingTop: spacing.sm },
});

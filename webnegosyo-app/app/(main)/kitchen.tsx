import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
} from "react-native";
import { FunctionReference } from "convex/server";
import { useKeepAwake } from "expo-keep-awake";
import { useSafeQuery, useSafeMutation } from "../../lib/hooks";
import { filterOrdersToScope } from "../../lib/branch-scope";
import { useBranchScope } from "../../lib/use-branch-scope";
import {
  selectKitchenTickets,
  aggregateAllDay,
  bumpTargetStatus,
  recallTargetStatus,
  type KitchenOrderLike,
  type KitchenItemLike,
  type KitchenTicket,
} from "../../lib/kitchen-tickets";
import { buildKitchenChitSegments } from "../../lib/kitchen-chit";
import { printReceiptSegments } from "../../lib/printer";
import { selectNewOrders } from "../../lib/order-alerts-utils";
import { hasLiveOrderBackend } from "../../lib/order-backend";
import { useAuthStore } from "../../stores/auth-store";
import { usePrinterStore } from "../../stores/printer-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { TicketCard, kds } from "../../components/kitchen/TicketCard";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getAllOrderItemsRef = "orders:getAllOrderItems" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

/** Same bounded recent-orders page the queue reads (adapter QUEUE_LIMIT). */
const ORDERS_FETCH_LIMIT = 200;

/** Timers redraw twice a minute; a chit clock does not need seconds. */
const TIMER_TICK_MS = 30_000;

/** Tablet landscape fits three tickets across; portrait tablets two. */
const THREE_COLUMN_MIN_WIDTH = 900;
const TWO_COLUMN_MIN_WIDTH = 600;

interface KitchenOrder extends KitchenOrderLike {
  orderType?: string;
}

export default function KitchenScreen() {
  // A kitchen display that dims mid-rush is a broken kitchen display.
  useKeepAwake();

  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const outletName = useAuthStore((s) => s.outletName);
  const hasBackend = hasLiveOrderBackend({ convexUrl, orderBackend });
  const { printer } = usePrinterStore();

  const { width } = useWindowDimensions();
  const numColumns = width >= THREE_COLUMN_MIN_WIDTH ? 3 : width >= TWO_COLUMN_MIN_WIDTH ? 2 : 1;

  const { data: orders, isLoading, error } = useSafeQuery<KitchenOrder[]>(getOrdersRef, {
    limit: ORDERS_FETCH_LIMIT,
  });
  const { data: allItems } = useSafeQuery<KitchenItemLike[]>(getAllOrderItemsRef, {});
  const updateStatus = useSafeMutation(updateOrderStatusRef);
  const scope = useBranchScope();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const [isAllDayOpen, setAllDayOpen] = useState(false);
  const [lastBumped, setLastBumped] = useState<{ orderId: string; ref: string } | null>(null);

  const scopedOrders = useMemo(
    () => filterOrdersToScope(scope, orders) as KitchenOrder[] | undefined,
    [scope, orders],
  );
  const tickets = useMemo(
    () => selectKitchenTickets(scopedOrders, allItems),
    [scopedOrders, allItems],
  );
  const allDay = useMemo(() => aggregateAllDay(tickets), [tickets]);

  // Flash genuinely new tickets. The global order alert already rings the
  // chime app-wide; the board only needs the visual.
  const prevIdsRef = useRef<Set<string> | null>(null);
  const newIds = useMemo(() => {
    const activeOrders = tickets.map((t) => t.order);
    const fresh = selectNewOrders(prevIdsRef.current, activeOrders);
    prevIdsRef.current = new Set(activeOrders.map((o) => o._id));
    return new Set(fresh.map((o) => o._id));
  }, [tickets]);

  const handleBump = useCallback(
    async (orderId: string) => {
      if (useAuthStore.getState().isDemo) {
        Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
        return;
      }
      const ticket = tickets.find((t) => t.order._id === orderId);
      try {
        await updateStatus({ orderId, status: bumpTargetStatus(ticket?.order.status ?? "") });
        setLastBumped({ orderId, ref: orderId.slice(-4).toUpperCase() });
      } catch {
        Alert.alert("Error", "Failed to bump the order. Check your connection and try again.");
      }
    },
    [tickets, updateStatus],
  );

  const handleRecall = useCallback(async () => {
    if (!lastBumped) return;
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    try {
      await updateStatus({ orderId: lastBumped.orderId, status: recallTargetStatus() });
      setLastBumped(null);
    } catch {
      Alert.alert("Error", "Failed to recall the order. Check your connection and try again.");
    }
  }, [lastBumped, updateStatus]);

  const handlePrint = useCallback(async (ticket: KitchenTicket) => {
    const result = await printReceiptSegments(
      buildKitchenChitSegments({ ...ticket.order, items: ticket.items }),
    );
    if (!result.success) {
      Alert.alert("Print failed", result.error ?? "Could not reach the printer.");
    }
  }, []);

  if (!hasBackend || error) {
    return (
      <View style={styles.screen}>
        <Header outletName={outletName} count={0} />
        <ErrorState
          message={error ?? "This store's order backend is not configured yet. Please contact support."}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Header outletName={outletName} count={0} />
        <LoadingState message="Loading the board…" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header outletName={outletName} count={tickets.length} />

      {allDay.length > 0 ? (
        <View style={styles.allDay}>
          <TouchableOpacity
            onPress={() => setAllDayOpen((open) => !open)}
            style={styles.allDayHeader}
            activeOpacity={0.7}
          >
            <Text style={styles.allDayTitle}>All day · {allDay.length} items</Text>
            <Text style={styles.allDayChevron}>{isAllDayOpen ? "▾" : "▸"}</Text>
          </TouchableOpacity>
          {isAllDayOpen ? (
            <View style={styles.allDayList}>
              {allDay.map((line) => (
                <View key={line.label} style={styles.allDayLine}>
                  <Text style={styles.allDayQty}>{line.quantity}×</Text>
                  <Text style={styles.allDayLabel} numberOfLines={1}>
                    {line.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {tickets.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyBody}>Confirmed orders appear here the moment they land.</Text>
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={tickets}
          numColumns={numColumns}
          keyExtractor={(ticket) => ticket.order._id}
          contentContainerStyle={styles.board}
          columnWrapperStyle={numColumns > 1 ? styles.boardRow : undefined}
          renderItem={({ item: ticket }) => (
            <TicketCard
              ticket={ticket}
              nowMs={nowMs}
              isNew={newIds.has(ticket.order._id)}
              onBump={handleBump}
              onPrint={handlePrint}
              canPrint={Boolean(printer)}
            />
          )}
        />
      )}

      {lastBumped ? (
        <TouchableOpacity style={styles.recallBar} onPress={handleRecall} activeOpacity={0.85}>
          <Text style={styles.recallText}>Recall #{lastBumped.ref} — back to preparing</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Header({ outletName, count }: { outletName: string | null; count: number }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.title}>Kitchen</Text>
        {outletName ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {outletName}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerRight}>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count} open</Text>
        </View>
        <WorkspaceSwitcher />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: kds.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerText: {
    flexShrink: 1,
  },
  title: {
    color: kds.ink,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: kds.inkSoft,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  countPill: {
    borderWidth: 1,
    borderColor: kds.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  countText: {
    color: kds.ink,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  allDay: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: kds.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: kds.cardBorder,
  },
  allDayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  allDayTitle: {
    color: kds.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  allDayChevron: {
    color: kds.inkSoft,
    fontSize: 14,
  },
  allDayList: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 6,
  },
  allDayLine: {
    flexDirection: "row",
    gap: 8,
  },
  allDayQty: {
    color: kds.ink,
    fontSize: 15,
    fontWeight: "800",
    minWidth: 32,
    fontVariant: ["tabular-nums"],
  },
  allDayLabel: {
    color: kds.inkSoft,
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  board: {
    paddingHorizontal: 12,
    paddingBottom: 96,
    gap: 12,
  },
  boardRow: {
    gap: 12,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: kds.ink,
    fontSize: 22,
    fontWeight: "800",
  },
  emptyBody: {
    color: kds.inkSoft,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  recallBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: kds.card,
    borderWidth: 1,
    borderColor: kds.warning,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  recallText: {
    color: kds.warning,
    fontSize: 15,
    fontWeight: "800",
  },
});

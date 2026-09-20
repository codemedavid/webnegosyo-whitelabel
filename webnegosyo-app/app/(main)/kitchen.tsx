import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
  type ListRenderItem,
} from "react-native";
import { FunctionReference } from "convex/server";
import { useKeepAwakeWhileFocused } from "../../hooks/useKeepAwakeWhileFocused";
import { useSafeQuery, useSafeMutation } from "../../lib/hooks";
import { filterOrdersToScope } from "../../lib/branch-scope";
import { useBranchScope } from "../../lib/use-branch-scope";
import {
  selectKitchenTickets,
  aggregateAllDay,
  bumpTargetStatus,
  recallTargetStatus,
  scanNewTickets,
  type KitchenOrderLike,
  type KitchenItemLike,
  type KitchenTicket,
} from "../../lib/kitchen-tickets";
import { buildKitchenChitSegments } from "../../lib/kitchen-chit";
import {
  isPrepTimeSupported,
  normalizePrepMinutes,
  promisedReadyAt,
  prepTimeTargetStatus,
} from "../../lib/prep-time";
import { printForRole } from "../../lib/printer";
import { printersForRole } from "../../lib/printer-registry";
import { hasLiveOrderBackend } from "../../lib/order-backend";
import { useAuthStore } from "../../stores/auth-store";
import { usePrinterStore } from "../../stores/printer-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { TicketCard, kds } from "../../components/kitchen/TicketCard";
import { TickerProvider } from "../../components/TickerProvider";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getAllOrderItemsRef = "orders:getAllOrderItems" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;
const setPrepTimeRef = "orders:setPrepTime" as unknown as FunctionReference<"mutation">;

/** Same bounded recent-orders page the queue reads (adapter QUEUE_LIMIT). */
const ORDERS_FETCH_LIMIT = 200;

/** Timers redraw twice a minute; a chit clock does not need seconds. */
const TIMER_TICK_MS = 30_000;

/** The wake lock's name, so the board's lock is distinct from any other. */
const KEEP_AWAKE_TAG = "kitchen-board";

const keyExtractor = (ticket: KitchenTicket) => ticket.order._id;

/** Tablet landscape fits three tickets across; portrait tablets two. */
const THREE_COLUMN_MIN_WIDTH = 900;
const TWO_COLUMN_MIN_WIDTH = 600;

interface KitchenOrder extends KitchenOrderLike {
  orderType?: string;
}

export default function KitchenScreen() {
  // A kitchen display that dims mid-rush is a broken kitchen display — but the
  // tab never unmounts, so the lock is held only while the board is in view.
  useKeepAwakeWhileFocused(KEEP_AWAKE_TAG);

  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const convexSchemaVersion = useAuthStore((s) => s.convexSchemaVersion);
  const outletName = useAuthStore((s) => s.outletName);
  const hasBackend = hasLiveOrderBackend({ convexUrl, orderBackend });
  const printers = usePrinterStore((s) => s.printers);
  const hasKitchenPrinter = printersForRole(printers, "kitchen").length > 0;

  const { width } = useWindowDimensions();
  const numColumns = width >= THREE_COLUMN_MIN_WIDTH ? 3 : width >= TWO_COLUMN_MIN_WIDTH ? 2 : 1;

  const { data: orders, isLoading, error } = useSafeQuery<KitchenOrder[]>(getOrdersRef, {
    limit: ORDERS_FETCH_LIMIT,
  });
  // Only the orders on the board — never the tenant's whole history.
  const { data: allItems } = useSafeQuery<KitchenItemLike[]>(
    getAllOrderItemsRef,
    orders === undefined ? "skip" : { orderIds: orders.map((order) => order._id) },
  );
  const updateStatus = useSafeMutation(updateOrderStatusRef);
  const setPrepTime = useSafeMutation(setPrepTimeRef);
  // A deployment without the prep-time bundle has no mutation to call, so the
  // chips are hidden rather than offered and left to throw.
  const canSetPrepTime = isPrepTimeSupported({ orderBackend, convexSchemaVersion });
  const scope = useBranchScope();

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

  // The bump and prep-time handlers take an id and look the ticket up here,
  // so they stay stable across board updates instead of closing over
  // `tickets` and handing every card new props on every poll.
  const ticketsByIdRef = useRef<ReadonlyMap<string, KitchenTicket>>(new Map());
  useEffect(() => {
    ticketsByIdRef.current = new Map(tickets.map((ticket) => [ticket.order._id, ticket]));
  }, [tickets]);

  // Flash genuinely new tickets. The global order alert already rings the
  // chime app-wide; the board only needs the visual.
  //
  // This runs in an effect, not during render: the scan carries a ref across
  // renders, and mutating that ref mid-render is what let a still-loading
  // (empty) board seed the seen-set and flash every ticket on open.
  const seenRef = useRef<ReadonlySet<string> | null>(null);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    // `undefined` while the query is in flight — never `[]`, which would read
    // as "answered: nothing active" and re-flash the board on the next tick.
    const ids = orders === undefined ? undefined : tickets.map((t) => t.order._id);
    const scan = scanNewTickets(seenRef.current, ids);
    seenRef.current = scan.seen;
    setNewIds(scan.newIds);
  }, [tickets, orders]);

  const handleBump = useCallback(
    async (orderId: string) => {
      if (useAuthStore.getState().isDemo) {
        Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
        return;
      }
      const ticket = ticketsByIdRef.current.get(orderId);
      try {
        await updateStatus({ orderId, status: bumpTargetStatus(ticket?.order.status ?? "") });
        setLastBumped({ orderId, ref: orderId.slice(-4).toUpperCase() });
      } catch {
        Alert.alert("Error", "Failed to bump the order. Check your connection and try again.");
      }
    },
    [updateStatus],
  );

  const handleSetPrepTime = useCallback(
    async (orderId: string, minutes: number) => {
      if (useAuthStore.getState().isDemo) {
        Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
        return;
      }
      const normalized = normalizePrepMinutes(minutes);
      if (normalized === null) {
        Alert.alert("Prep time", "Enter a whole number of minutes, up to 4 hours.");
        return;
      }
      const ticket = ticketsByIdRef.current.get(orderId);
      try {
        await setPrepTime({
          orderId,
          prepMinutes: normalized,
          // Stamped from NOW, not from when the order was placed: this is the
          // moment the kitchen is committing to.
          promisedReadyAt: new Date(promisedReadyAt(Date.now(), normalized)).toISOString(),
          status: prepTimeTargetStatus(ticket?.order.status ?? ""),
        });
      } catch {
        Alert.alert("Error", "Could not save the prep time. Check your connection and try again.");
      }
    },
    [setPrepTime],
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
    const outcome = await printForRole(
      "kitchen",
      buildKitchenChitSegments({ ...ticket.order, items: ticket.items }),
    );
    if (!outcome.anySuccess) {
      const firstError = outcome.results[0]?.result.error;
      Alert.alert("Print failed", firstError ?? "Could not reach the kitchen printer.");
    }
  }, []);

  const renderItem = useCallback<ListRenderItem<KitchenTicket>>(
    ({ item: ticket }) => (
      <TicketCard
        ticket={ticket}
        isNew={newIds.has(ticket.order._id)}
        onBump={handleBump}
        onPrint={handlePrint}
        canPrint={hasKitchenPrinter}
        canSetPrepTime={canSetPrepTime}
        onSetPrepTime={handleSetPrepTime}
      />
    ),
    [newIds, handleBump, handlePrint, hasKitchenPrinter, canSetPrepTime, handleSetPrepTime],
  );

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
        // The cards read the clock from the ticker, so a tick redraws the
        // timers without re-rendering the board. `key={numColumns}` stays:
        // FlatList throws on a live numColumns change and asks for exactly this.
        <TickerProvider intervalMs={TIMER_TICK_MS}>
          <FlatList
            key={numColumns}
            data={tickets}
            numColumns={numColumns}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.board}
            columnWrapperStyle={numColumns > 1 ? styles.boardRow : undefined}
            renderItem={renderItem}
          />
        </TickerProvider>
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
  const open = `${count} open`;
  return (
    <>
      <ScreenHeader
        title="Kitchen"
        subtitle={outletName ? `${open} · ${outletName}` : open}
        tone="dark"
        style={styles.header}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: kds.background,
  },
  header: {
    backgroundColor: kds.background,
    borderBottomWidth: 1,
    borderBottomColor: kds.cardBorder,
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

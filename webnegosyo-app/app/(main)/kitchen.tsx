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
import { useIsFocused } from "@react-navigation/native";
import { useKeepAwakeWhileFocused } from "../../hooks/useKeepAwakeWhileFocused";
import { useKitchenRing } from "../../hooks/useKitchenRing";
import { useSafeQuery, useSafeMutation } from "../../lib/hooks";
import {
  useOfflineOrderItems,
  useOfflineOrderList,
  useOfflineOrderMutation,
} from "../../lib/offline/use-offline-orders";
import { isQueuedOrderWrite } from "../../lib/offline/write-order-change";
import { syncStockForStatusChange } from "../../lib/order-cancel-stock";
import { guardKitchenStatusWrite } from "../../lib/fresh-order-status";
import { useFreshOrderStatus } from "../../lib/use-fresh-order-status";
import { OfflineOrdersNotice } from "../../components/OfflineOrdersNotice";
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
  AWAITING_KITCHEN_STATUS,
  EMPTY_RING_TRACKER,
  confirmWritePlan,
  kitchenTicketStatus,
  ringingIdsKey,
  trackRinging,
  withRinging,
  withoutRinging,
  type RingTracker,
} from "../../lib/kitchen-confirm";
import { forgetConfirmedOnThisDevice, rememberConfirmedHere } from "../../lib/kitchen-confirm-local";
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
import { RingStatusBar } from "../../components/kitchen/RingStatusBar";
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

/** Shown when Confirm finds the order already moved on elsewhere. */
const ALREADY_CONFIRMED_MESSAGE = "Already confirmed on another display.";

/** How long a refusal notice stays on the board before it clears itself. */
const NOTICE_DISMISS_MS = 5_000;

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

  const isFocused = useIsFocused();
  const isDemo = useAuthStore((s) => s.isDemo);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const convexSchemaVersion = useAuthStore((s) => s.convexSchemaVersion);
  const outletName = useAuthStore((s) => s.outletName);
  const hasBackend = hasLiveOrderBackend({ convexUrl, orderBackend });
  const printers = usePrinterStore((s) => s.printers);
  const hasKitchenPrinter = printersForRole(printers, "kitchen").length > 0;

  const { width } = useWindowDimensions();
  const numColumns = width >= THREE_COLUMN_MIN_WIDTH ? 3 : width >= TWO_COLUMN_MIN_WIDTH ? 2 : 1;

  const ordersResult = useSafeQuery<KitchenOrder[]>(getOrdersRef, {
    limit: ORDERS_FETCH_LIMIT,
  });
  // Tickets rung up or bumped while offline stay on the board (lib/offline/).
  const { data: mergedOrders, isLoading, error, isOffline, savedAt } = useOfflineOrderList(ordersResult, {
    snapshotName: "kitchen:getOrders",
  });
  const orders = mergedOrders as KitchenOrder[] | undefined;
  // Only the orders on the board — never the tenant's whole history — and
  // only those the server holds: a device-only id is not one it can look up.
  const serverOrders = ordersResult.data;
  const { data: serverItems } = useSafeQuery<KitchenItemLike[]>(
    getAllOrderItemsRef,
    serverOrders === undefined ? "skip" : { orderIds: serverOrders.map((order) => order._id) },
  );
  const allItems = useOfflineOrderItems(serverItems) as KitchenItemLike[] | undefined;
  const updateStatus = useOfflineOrderMutation(updateOrderStatusRef);
  const setPrepTime = useSafeMutation(setPrepTimeRef);
  // A deployment without the prep-time bundle has no mutation to call, so the
  // chips are hidden rather than offered and left to throw.
  const canSetPrepTime = isPrepTimeSupported({ orderBackend, convexSchemaVersion });
  const scope = useBranchScope();

  const [isAllDayOpen, setAllDayOpen] = useState(false);
  const [lastBumped, setLastBumped] = useState<{ orderId: string; ref: string } | null>(null);
  // A refused bump says why on the board itself — a modal would stall a rush.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  const readFreshStatus = useFreshOrderStatus();

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

  // New tickets ring until a cook taps Confirm (lib/kitchen-confirm.ts). Same
  // in-flight rule as the flash: `undefined` is "not answered", never "empty".
  const [ringTracker, setRingTracker] = useState<RingTracker>(EMPTY_RING_TRACKER);
  // Confirmed on this display but not yet echoed back by the next poll.
  const [confirmedHere, setConfirmedHere] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const snapshot =
      orders === undefined
        ? undefined
        : tickets.map((ticket) => ({ id: ticket.order._id, status: ticket.order.status }));
    setRingTracker((prev) => trackRinging(prev, snapshot, Date.now()));
    // Once the board itself shows a confirmed ticket as moved on (or gone),
    // `confirmedHere` has done its job.
    if (snapshot) {
      const stillWaiting = new Set(
        snapshot.filter((ticket) => ticket.status === AWAITING_KITCHEN_STATUS).map((ticket) => ticket.id),
      );
      setConfirmedHere((prev) => {
        const kept = [...prev].filter((id) => stillWaiting.has(id));
        return kept.length === prev.size ? prev : new Set(kept);
      });
    }
  }, [tickets, orders]);
  const ringingKey = ringingIdsKey(ringTracker);
  // Only while the board is on screen: the tab never unmounts, so a cashier
  // who once opened Kitchen must not hear it ringing on the register.
  const { testSound } = useKitchenRing({ ringingKey, enabled: isFocused && !isDemo && hasBackend });

  const statusOf = useCallback(
    (orderStatus: string, orderId: string) =>
      confirmedHere.has(orderId)
        ? "confirmed"
        : kitchenTicketStatus(orderStatus, ringTracker.ringing.has(orderId)),
    [confirmedHere, ringTracker],
  );
  const waitingCount = useMemo(
    () => tickets.filter((ticket) => statusOf(ticket.order.status, ticket.order._id) === "waiting").length,
    [tickets, statusOf],
  );

  // When each ticket first rang, readable from the tap handlers without
  // re-creating them on every poll.
  const ringingRef = useRef(ringTracker.ringing);
  useEffect(() => {
    ringingRef.current = ringTracker.ringing;
  }, [ringTracker]);

  /**
   * Marks the order as this device's confirmation: banner skip + ring stop.
   * Returns when it first rang, so a failed write can put the ring back.
   */
  const noteConfirmedHere = useCallback((orderId: string): number | undefined => {
    const rangAtMs = ringingRef.current.get(orderId);
    rememberConfirmedHere(orderId);
    setRingTracker((prev) => withoutRinging(prev, orderId));
    setConfirmedHere((prev) => new Set([...prev, orderId]));
    return rangAtMs;
  }, []);
  /** Undoes `noteConfirmedHere`; `rangAtMs` set = the write failed, ring again. */
  const forgetConfirmedHere = useCallback((orderId: string, rangAtMs?: number) => {
    forgetConfirmedOnThisDevice(orderId);
    setConfirmedHere((prev) => new Set([...prev].filter((id) => id !== orderId)));
    if (rangAtMs !== undefined) setRingTracker((prev) => withRinging(prev, orderId, rangAtMs));
  }, []);

  const handleBump = useCallback(
    async (orderId: string) => {
      if (useAuthStore.getState().isDemo) {
        Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
        return;
      }
      // The board can be seconds behind. Ask the server first: a ticket
      // cancelled elsewhere must not be written back to life (its stock was
      // restored by the cancel), so the bump is refused instead.
      const guard = guardKitchenStatusWrite({
        boardStatus: ticketsByIdRef.current.get(orderId)?.order.status,
        freshStatus: await readFreshStatus(orderId),
      });
      if (!guard.allow) {
        setNotice(guard.message);
        return;
      }
      const { previousStatus } = guard;
      const newStatus = bumpTargetStatus(previousStatus ?? "");
      // Bumping an unconfirmed ticket confirms it too; the cashier hears about
      // it from the other devices, not this one.
      try {
        const written = await updateStatus({ orderId, status: newStatus }, { previousStatus });
        if (previousStatus === AWAITING_KITCHEN_STATUS) rememberConfirmedHere(orderId);
        // The one stock rule every status path shares. A change kept on the
        // device runs it on replay instead. Background, never throws.
        if (!isQueuedOrderWrite(written)) {
          void syncStockForStatusChange({ orderId, newStatus, previousStatus });
        }
        setLastBumped({ orderId, ref: orderId.slice(-4).toUpperCase() });
      } catch {
        Alert.alert("Error", "Failed to bump the order. Check your connection and try again.");
      }
    },
    [updateStatus, readFreshStatus],
  );

  const handleConfirm = useCallback(
    async (orderId: string) => {
      if (useAuthStore.getState().isDemo) {
        Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
        return;
      }
      // The tap answers at once (ring stops, card flips) — the server check
      // below can take seconds, and a cook who hears it still ringing taps again.
      const rangAtMs = noteConfirmedHere(orderId);
      // Same server check as a bump: a cancelled order is never revived, and
      // one already confirmed or bumped elsewhere is left where it is.
      const guard = guardKitchenStatusWrite({
        boardStatus: ticketsByIdRef.current.get(orderId)?.order.status,
        freshStatus: await readFreshStatus(orderId),
      });
      if (!guard.allow) {
        forgetConfirmedHere(orderId);
        setNotice(guard.message);
        return;
      }
      const { previousStatus } = guard;
      const plan = confirmWritePlan(previousStatus);
      if (!plan.shouldWrite) {
        setNotice(ALREADY_CONFIRMED_MESSAGE);
        return;
      }
      try {
        const written = await updateStatus({ orderId, status: plan.status }, { previousStatus });
        if (!isQueuedOrderWrite(written)) {
          void syncStockForStatusChange({ orderId, newStatus: plan.status, previousStatus });
        }
      } catch {
        forgetConfirmedHere(orderId, rangAtMs);
        Alert.alert("Error", "Failed to confirm the order. Check your connection and try again.");
      }
    },
    [updateStatus, readFreshStatus, noteConfirmedHere, forgetConfirmedHere],
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
      // Committing to a time confirms the ticket (it moves to preparing).
      const isConfirming = ticket?.order.status === AWAITING_KITCHEN_STATUS;
      const rangAtMs = isConfirming ? noteConfirmedHere(orderId) : undefined;
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
        if (isConfirming) forgetConfirmedHere(orderId, rangAtMs);
        Alert.alert("Error", "Could not save the prep time. Check your connection and try again.");
      }
    },
    [setPrepTime, noteConfirmedHere, forgetConfirmedHere],
  );

  const handleRecall = useCallback(async () => {
    if (!lastBumped) return;
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    // Same check as a bump: a recall of a ticket cancelled since must not
    // resurrect it. The server's status, else the board's last word on it.
    const { orderId } = lastBumped;
    const guard = guardKitchenStatusWrite({
      boardStatus: ticketsByIdRef.current.get(orderId)?.order.status,
      freshStatus: await readFreshStatus(orderId),
    });
    if (!guard.allow) {
      setNotice(guard.message);
      setLastBumped(null);
      return;
    }
    const { previousStatus } = guard;
    const newStatus = recallTargetStatus();
    try {
      const written = await updateStatus({ orderId, status: newStatus }, { previousStatus });
      if (!isQueuedOrderWrite(written)) {
        void syncStockForStatusChange({ orderId, newStatus, previousStatus });
      }
      setLastBumped(null);
    } catch {
      Alert.alert("Error", "Failed to recall the order. Check your connection and try again.");
    }
  }, [lastBumped, updateStatus, readFreshStatus]);

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
        kitchenStatus={statusOf(ticket.order.status, ticket.order._id)}
        rangAtMs={ringTracker.ringing.get(ticket.order._id) ?? null}
        onConfirm={handleConfirm}
        onBump={handleBump}
        onPrint={handlePrint}
        canPrint={hasKitchenPrinter}
        canSetPrepTime={canSetPrepTime}
        onSetPrepTime={handleSetPrepTime}
      />
    ),
    [
      newIds,
      statusOf,
      ringTracker,
      handleConfirm,
      handleBump,
      handlePrint,
      hasKitchenPrinter,
      canSetPrepTime,
      handleSetPrepTime,
    ],
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
      <OfflineOrdersNotice isOffline={isOffline} savedAt={savedAt} />
      <RingStatusBar
        ringingCount={ringTracker.ringing.size}
        waitingCount={waitingCount}
        onTestSound={testSound}
      />

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

      {notice ? (
        <TouchableOpacity
          style={[styles.recallBar, lastBumped ? styles.noticeAboveRecall : null]}
          onPress={() => setNotice(null)}
          activeOpacity={0.85}
          accessibilityRole="alert"
        >
          <Text style={styles.recallText}>{notice}</Text>
        </TouchableOpacity>
      ) : null}

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
  noticeAboveRecall: {
    bottom: 80,
  },
  recallText: {
    color: kds.warning,
    fontSize: 15,
    fontWeight: "800",
  },
});

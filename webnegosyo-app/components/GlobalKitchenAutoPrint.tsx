import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../lib/hooks";
import { useAuthStore } from "../stores/auth-store";
import { usePrinterStore } from "../stores/printer-store";
import { printersForRole } from "../lib/printer-registry";
import { printForRole } from "../lib/printer";
import { hasLiveOrderBackend } from "../lib/order-backend";
import { filterOrdersToScope } from "../lib/branch-scope";
import { useBranchScope } from "../lib/use-branch-scope";
import {
  selectKitchenTickets,
  scanNewTickets,
  type KitchenOrderLike,
  type KitchenItemLike,
  type KitchenTicket,
} from "../lib/kitchen-tickets";
import { buildKitchenChitSegments } from "../lib/kitchen-chit";
import {
  selectTicketsToAutoPrint,
  recordPrinted,
  parsePrintedList,
  serializePrintedList,
} from "../lib/kitchen-autoprint";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getAllOrderItemsRef = "orders:getAllOrderItems" as unknown as FunctionReference<"query">;

/** Same bounded recent-orders page the kitchen board reads. */
const ORDERS_FETCH_LIMIT = 200;

/** Order ids this device already auto-printed, so a remount never reprints. */
const PRINTED_STORAGE_KEY = "kitchen_printed_orders";

/**
 * App-wide kitchen auto-print host. Mounted once in the (main) tab layout —
 * like GlobalOrderAlerts — so a device with a kitchen-role printer prints the
 * chit the moment a new order lands, whichever tab is open. Renders nothing.
 *
 * The outer gate keeps idle devices free: the order subscriptions only exist
 * while the merchant has the toggle on AND a kitchen-role printer saved. On
 * Convex tenants the queries are deduped against the kitchen board's own
 * subscription; on platform tenants they ride the same Supabase-Realtime
 * -triggered refetch.
 *
 * Limitation, stated in the settings copy too: printing runs in JS, so the
 * app must be foregrounded. Background push cannot move paper.
 */
export function GlobalKitchenAutoPrint() {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);
  const kitchenAutoPrint = usePrinterStore((s) => s.kitchenAutoPrint);
  const printers = usePrinterStore((s) => s.printers);

  const isArmed =
    kitchenAutoPrint &&
    !isDemo &&
    printersForRole(printers, "kitchen").length > 0 &&
    hasLiveOrderBackend({ convexUrl, orderBackend });

  if (!isArmed) return null;
  return <KitchenAutoPrintWatcher />;
}

function KitchenAutoPrintWatcher() {
  const { data: orders } = useSafeQuery<KitchenOrderLike[]>(getOrdersRef, {
    limit: ORDERS_FETCH_LIMIT,
  });
  const { data: allItems } = useSafeQuery<KitchenItemLike[]>(getAllOrderItemsRef, {});
  const scope = useBranchScope();

  // The persisted printed-list guards the remount gap: unmounting resets the
  // in-memory seen-set, and without the list every live ticket would count as
  // "new" again on the next mount and print twice.
  const [printedList, setPrintedList] = useState<readonly string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PRINTED_STORAGE_KEY)
      .then((raw) => {
        if (!cancelled) setPrintedList(parsePrintedList(raw));
      })
      .catch(() => {
        if (!cancelled) setPrintedList([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const seenRef = useRef<ReadonlySet<string> | null>(null);
  // New ids observed before the printed-list hydrated; checked once it has.
  const pendingRef = useRef<readonly string[]>([]);
  const isPrintingRef = useRef(false);

  useEffect(() => {
    if (orders === undefined) return;

    const scopedOrders = filterOrdersToScope(scope, orders) as KitchenOrderLike[];
    const tickets = selectKitchenTickets(scopedOrders, allItems);

    const scan = scanNewTickets(
      seenRef.current,
      tickets.map((t) => t.order._id),
    );
    seenRef.current = scan.seen;
    const observed = [...pendingRef.current, ...scan.newIds];
    if (observed.length === 0) return;

    if (printedList === null) {
      // Storage not answered yet — hold the ids, never drop or double-print.
      pendingRef.current = observed;
      return;
    }
    pendingRef.current = [];

    const toPrint = selectTicketsToAutoPrint({
      newIds: observed,
      printedList,
      enabled: true, // the outer gate already checked the toggle
      hasKitchenPrinter: true, // and the kitchen-role printer
      isDemo: false, // and demo mode
    });
    if (toPrint.length === 0) return;

    // Record BEFORE printing: a chit that jams reprints from the ticket's
    // manual button; a crash loop reprinting every new order is worse.
    const nextPrinted = recordPrinted(printedList, toPrint);
    setPrintedList(nextPrinted);
    AsyncStorage.setItem(PRINTED_STORAGE_KEY, serializePrintedList(nextPrinted)).catch(() => {
      // A failed persist only risks one duplicate chit after a remount.
    });

    const ticketsById = new Map(tickets.map((t) => [t.order._id, t]));
    void printTicketsSequentially(
      toPrint
        .map((id) => ticketsById.get(id))
        .filter((t): t is KitchenTicket => t !== undefined),
      isPrintingRef,
    );
  }, [orders, allItems, scope, printedList]);

  return null;
}

/**
 * Print chits one after another. printForRole already serializes at the
 * queue, but chaining here keeps this watcher from flooding the queue when a
 * burst of orders lands at once.
 */
async function printTicketsSequentially(
  tickets: readonly KitchenTicket[],
  isPrintingRef: { current: boolean },
): Promise<void> {
  isPrintingRef.current = true;
  try {
    for (const ticket of tickets) {
      const outcome = await printForRole(
        "kitchen",
        buildKitchenChitSegments({ ...ticket.order, items: ticket.items }),
      );
      if (!outcome.anySuccess) {
        const firstError = outcome.results[0]?.result.error;
        console.warn(
          "[KitchenAutoPrint] Chit failed for order",
          ticket.order._id,
          firstError ?? "no kitchen printer",
        );
      }
    }
  } finally {
    isPrintingRef.current = false;
  }
}

import { useEffect, useRef } from "react";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../lib/hooks";
import { useAuthStore } from "../stores/auth-store";
import { usePrinterStore } from "../stores/printer-store";
import { printersForRole } from "../lib/printer-registry";
import { hasLiveOrderBackend } from "../lib/order-backend";
import { filterOrdersToScope } from "../lib/branch-scope";
import { useBranchScope } from "../lib/use-branch-scope";
import { shouldPrintAt } from "../lib/print-trigger";
import { scanNewTickets } from "../lib/kitchen-tickets";
import { claimPrinted, usePrintedLedger } from "../lib/printed-ledger";
import { selectConfirmedOrderIds, selectOrdersToAutoPrint } from "../lib/receipt-autoprint";
import { useOrderPrint } from "../hooks/useOrderPrint";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getAllOrderItemsRef = "orders:getAllOrderItems" as unknown as FunctionReference<"query">;

/** Same bounded recent-orders page the kitchen watcher and board read. */
const ORDERS_FETCH_LIMIT = 200;

interface ReceiptOrder {
  _id: string;
  _creationTime: number;
  status: string;
  source?: string;
  customerName: string;
  customerContact: string;
  orderType?: string;
  total: number;
  deliveryFee?: number;
  paymentMethod?: string;
  outletId?: string;
}

interface ReceiptItem {
  orderId: string;
  menuItemName: string;
  quantity: number;
  subtotal: number;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string }[];
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
}

/**
 * App-wide "print on confirmation" host. Mounted once in the (main) tab
 * layout beside GlobalKitchenAutoPrint, so the cashier receipt prints the
 * moment an order becomes confirmed — from the order screen, the orders list,
 * the Drawer's incoming sheet, or the web admin — whichever tab is open.
 *
 * Before this, only the order-detail screen printed on confirm; every other
 * confirm surface either printed nothing or told the cashier to go find the
 * order. Reacting to the status transition instead of the tap is what makes
 * the setting mean what it says.
 *
 * Armed only while the merchant's trigger fires on confirmation AND a
 * cashier-role printer is saved, so idle devices carry no subscription.
 * Renders nothing.
 */
export function GlobalReceiptAutoPrint() {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);
  const printTrigger = usePrinterStore((s) => s.printTrigger);
  const printers = usePrinterStore((s) => s.printers);

  const isArmed =
    shouldPrintAt("confirmation", printTrigger) &&
    !isDemo &&
    printersForRole(printers, "cashier").length > 0 &&
    hasLiveOrderBackend({ convexUrl, orderBackend });

  if (!isArmed) return null;
  return <ReceiptAutoPrintWatcher />;
}

function ReceiptAutoPrintWatcher() {
  const { data: orders } = useSafeQuery<ReceiptOrder[]>(getOrdersRef, {
    limit: ORDERS_FETCH_LIMIT,
  });
  const { data: allItems } = useSafeQuery<ReceiptItem[]>(getAllOrderItemsRef, {});
  const scope = useBranchScope();
  const { printOrder } = useOrderPrint();

  // The shared printed ledger, so a remount (tab layout re-created, printer
  // store reloaded) does not re-adopt live confirmed orders as "new".
  const printedList = usePrintedLedger("receipt");

  const seenRef = useRef<ReadonlySet<string> | null>(null);
  // Transitions observed before the printed-list hydrated; replayed once it has.
  const pendingRef = useRef<readonly string[]>([]);
  const printOrderRef = useRef(printOrder);
  printOrderRef.current = printOrder;

  useEffect(() => {
    if (orders === undefined) return;

    const scopedOrders = filterOrdersToScope(scope, orders) as ReceiptOrder[];
    const scan = scanNewTickets(seenRef.current, selectConfirmedOrderIds(scopedOrders));
    seenRef.current = scan.seen;
    const observed = [...pendingRef.current, ...scan.newIds];
    if (observed.length === 0) return;

    if (printedList === null) {
      pendingRef.current = observed;
      return;
    }
    pendingRef.current = [];

    const candidates = selectOrdersToAutoPrint({
      newIds: observed,
      printedList,
      printsOnConfirmation: true, // the outer gate already checked the trigger
      hasCashierPrinter: true, // and the cashier-role printer
      isDemo: false, // and demo mode
    });
    if (candidates.length === 0) return;

    const ordersById = new Map(scopedOrders.map((order) => [order._id, order]));
    const itemsByOrder = new Map<string, ReceiptItem[]>();
    for (const item of allItems ?? []) {
      itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
    }
    // Claim BEFORE printing: a jammed receipt reprints from the order
    // screen's button; a crash loop reprinting every confirmation is worse.
    void claimPrinted("receipt", candidates).then((toPrint) =>
      printReceiptsSequentially(
        toPrint
          .map((id) => ordersById.get(id))
          .filter((order): order is ReceiptOrder => order !== undefined)
          .map((order) => ({ ...order, items: itemsByOrder.get(order._id) ?? [] })),
        printOrderRef.current,
      ),
    );
  }, [orders, allItems, scope, printedList]);

  return null;
}

type PrintReceipt = (order: ReceiptOrder & { items: ReceiptItem[] }) => Promise<boolean>;

/** One receipt after another, so a burst of confirmations cannot interleave. */
async function printReceiptsSequentially(
  orders: readonly (ReceiptOrder & { items: ReceiptItem[] })[],
  print: PrintReceipt,
): Promise<void> {
  for (const order of orders) {
    const printed = await print(order);
    if (!printed) {
      console.warn("[ReceiptAutoPrint] Receipt failed for order", order._id);
    }
  }
}

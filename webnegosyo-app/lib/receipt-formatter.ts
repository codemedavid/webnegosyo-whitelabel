import { readOrderDiscount } from "./order-discount";
import { orderSummaryRows, type OrderSummaryRowKind } from "./order-summary-rows";

/**
 * The receipt's own wording for each row kind.
 *
 * Keyed by the whole union rather than defaulted, so a kind added to
 * `orderSummaryRows` later fails the type check here instead of silently
 * printing under somebody else's label. `discount` and `total` are drawn by
 * hand below and never read from this map.
 */
const RECEIPT_LABELS: Record<OrderSummaryRowKind, string> = {
  subtotal: "Subtotal:",
  discount: "Discount:",
  service: "Service Charge:",
  delivery: "Delivery Fee:",
  total: "TOTAL:",
};

interface ReceiptOrderItem {
  menuItemName: string;
  quantity: number;
  subtotal: number;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string }[];
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

interface ReceiptOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  orderType?: string;
  total: number;
  deliveryFee?: number;
  paymentMethod?: string;
  items?: ReceiptOrderItem[];
  // --- POS counter sales (see lib/pos-order.ts) ---
  /** Cash handed over by the customer. Printed only alongside changeDue. */
  cashTendered?: number;
  /** Change handed back. Printed only alongside cashTendered (0 is valid). */
  changeDue?: number;
  /** Transaction reference for a scanned e-wallet payment. */
  paymentReference?: string;
  // --- Discounts (see lib/order-discount.ts) ---
  // Untyped on purpose: the breakdown rides in a free-form blob on Convex and
  // in a column on Postgres, and `readOrderDiscount` is what shape-checks it.
  customerData?: unknown;
  customer_data?: unknown;
  discount_data?: unknown;
}

interface ReceiptConfig {
  storeName: string;
  storeAddress?: string;
  width?: number; // characters per line, default 32
}

function center(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(padding) + text;
}

function line(char: string, width: number): string {
  return char.repeat(width);
}

/** Clip a line to the paper width — thermal paper wraps unreadably otherwise. */
function truncate(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, width);
}

function leftRight(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(gap) + right;
}

export function formatReceipt(order: ReceiptOrder, config: ReceiptConfig): string {
  const w = config.width ?? 32;
  const lines: string[] = [];

  // Header
  lines.push(line("=", w));
  lines.push(center(config.storeName.toUpperCase(), w));
  if (config.storeAddress) {
    lines.push(center(config.storeAddress, w));
  }
  lines.push(line("=", w));

  // Order info
  const orderNum = order._id.slice(-8).toUpperCase();
  const date = new Date(order._creationTime);
  const dateStr = date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

  lines.push(`Order #: ${orderNum}`);
  lines.push(`Date: ${dateStr}  ${timeStr}`);
  lines.push(`Customer: ${order.customerName}`);
  if (order.orderType) {
    lines.push(`Type: ${order.orderType}`);
  }

  // Items
  lines.push(line("-", w));
  lines.push(leftRight("Qty  Item", "Amount", w));
  lines.push(line("-", w));

  // Separate regular and bundle items
  const regularItems: ReceiptOrderItem[] = [];
  const bundleMap = new Map<string, { name: string; items: ReceiptOrderItem[]; total: number }>();

  for (const item of order.items ?? []) {
    if (item.isBundleItem && item.bundleId) {
      const existing = bundleMap.get(item.bundleId);
      if (existing) {
        existing.items.push(item);
        existing.total += item.subtotal;
      } else {
        bundleMap.set(item.bundleId, {
          name: item.bundleName ?? "Bundle",
          items: [item],
          total: item.subtotal,
        });
      }
    } else {
      regularItems.push(item);
    }
  }

  let subtotal = 0;

  // Print regular items
  for (const item of regularItems) {
    subtotal += item.subtotal;
    const qtyStr = ` ${item.quantity}`;
    const priceStr = `P${item.subtotal.toFixed(2)}`;
    const nameMaxLen = Math.max(0, w - qtyStr.length - priceStr.length - 3);
    let name: string;
    if (nameMaxLen === 0) {
      name = "";
    } else if (item.menuItemName.length > nameMaxLen) {
      name = nameMaxLen > 1 ? item.menuItemName.slice(0, nameMaxLen - 1) + "." : item.menuItemName.slice(0, nameMaxLen);
    } else {
      name = item.menuItemName;
    }

    lines.push(leftRight(`${qtyStr}  ${name}`, priceStr, w));

    if (item.variationSelections && item.variationSelections.length > 0) {
      for (const sel of item.variationSelections) {
        lines.push(`     - ${sel.optionName}`);
      }
    } else if (item.variation) {
      lines.push(`     - ${item.variation}`);
    }

    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        lines.push(`     + ${addon.name}`);
      }
    }

    if (item.specialInstructions) {
      lines.push(`     Note: ${item.specialInstructions}`);
    }
  }

  // Print bundle groups
  for (const [, bundle] of bundleMap) {
    subtotal += bundle.total;
    lines.push("");
    lines.push(`*** BUNDLE: ${bundle.name} ***`);

    for (const item of bundle.items) {
      const slotPrefix = item.slotName ? `[${item.slotName}] ` : "";
      const qtyStr = ` ${item.quantity}`;
      const priceStr = `P${item.subtotal.toFixed(2)}`;
      const fullName = `${slotPrefix}${item.menuItemName}`;
      const nameMaxLen = Math.max(0, w - qtyStr.length - priceStr.length - 3);
      let name: string;
      if (nameMaxLen === 0) {
        name = "";
      } else if (fullName.length > nameMaxLen) {
        name = nameMaxLen > 1 ? fullName.slice(0, nameMaxLen - 1) + "." : fullName.slice(0, nameMaxLen);
      } else {
        name = fullName;
      }

      lines.push(leftRight(`${qtyStr}  ${name}`, priceStr, w));

      if (item.variationSelections && item.variationSelections.length > 0) {
        for (const sel of item.variationSelections) {
          lines.push(`     - ${sel.optionName}`);
        }
      } else if (item.variation) {
        lines.push(`     - ${item.variation}`);
      }

      if (item.addons && item.addons.length > 0) {
        for (const addon of item.addons) {
          lines.push(`     + ${addon.name}`);
        }
      }

      if (item.specialInstructions) {
        lines.push(`     Note: ${item.specialInstructions}`);
      }
    }

    lines.push(leftRight("  Bundle Total:", `P${bundle.total.toFixed(2)}`, w));
  }

  // Totals — validate computed subtotal against order.total.
  //
  // The discount has to be part of this sum, not just a printed line: without
  // it every discounted sale trips the warning, which trains merchants to
  // ignore the one signal meant to catch real corruption.
  const discount = readOrderDiscount(order);
  const expectedTotal = subtotal + (order.deliveryFee ?? 0) - (discount?.total ?? 0);
  if (Math.abs(expectedTotal - order.total) > 0.01) {
    console.warn(
      `[Receipt] Subtotal mismatch: computed=${expectedTotal.toFixed(2)} vs order.total=${order.total.toFixed(2)} (order ${order._id})`
    );
  }

  lines.push(line("-", w));

  // Which rows appear — whether a subtotal is warranted, one line per
  // discount, a remainder row for a discount no line accounts for — is decided
  // by `orderSummaryRows`, shared with the order screens. Only the wording and
  // the column layout are the receipt's own. A second copy of those rules is
  // how a printed receipt and a screen start disagreeing about one sale.
  const summaryRows = orderSummaryRows({
    subtotal,
    deliveryFee: order.deliveryFee,
    discount,
    total: order.total,
  });

  // The total is printed straight from `order.total` rather than through the
  // shared rows. It is the backend's authoritative figure, and the money
  // guardrail checks for it by name so a reader can see at a glance that the
  // receipt never prints a recomputed total.
  for (const row of summaryRows.filter((r) => r.kind !== "total")) {
    if (row.kind === "discount") {
      // The label is merchant-authored (a voucher name), so it is clipped to
      // leave room for the amount rather than trusted to fit.
      const amount = `-P${row.amount.toFixed(2)}`;
      lines.push(
        leftRight(truncate(row.label, Math.max(0, w - amount.length - 1)), amount, w),
      );
      continue;
    }

    const label = RECEIPT_LABELS[row.kind];
    lines.push(leftRight(label, `P${row.amount.toFixed(2)}`, w));
  }

  lines.push(line("-", w));
  lines.push(leftRight("TOTAL:", `P${order.total.toFixed(2)}`, w));
  if (order.paymentMethod) {
    lines.push(`Payment: ${order.paymentMethod}`);
  }

  // POS cash block. Both halves are required — printing a tender without the
  // change owed (or vice versa) would be worse than printing neither, so a
  // half-populated order falls back to the pre-POS receipt exactly.
  if (order.cashTendered !== undefined && order.changeDue !== undefined) {
    lines.push(leftRight("CASH:", `P${order.cashTendered.toFixed(2)}`, w));
    lines.push(leftRight("CHANGE:", `P${order.changeDue.toFixed(2)}`, w));
  }

  if (order.paymentReference) {
    lines.push(truncate(`Ref: ${order.paymentReference}`, w));
  }

  // Footer
  lines.push(line("=", w));
  lines.push(center("Thank you!", w));
  lines.push(line("=", w));
  lines.push(""); // Feed line

  return lines.join("\n");
}

import { readOrderDiscount } from "./order-discount";
import { orderSummaryRows, type OrderSummaryRowKind } from "./order-summary-rows";

/**
 * Block-based receipt rendering.
 *
 * A tenant's receipt is a stack of blocks rendered top to bottom. The Classic
 * preset reproduces the historic `formatReceipt` output byte-for-byte — every
 * tenant without a saved layout prints exactly what they always have. Layouts
 * arrive as untrusted JSON from the `tenants.receipt_layout` column, so
 * everything goes through `parseReceiptLayout` / `resolveReceiptLayout` and an
 * invalid layout falls back to Classic rather than printing a broken receipt.
 *
 * Mirrored (deliberately, like `qr-order-codec.ts`) in `src/lib/receipt-layout.ts`
 * so the web admin's visual editor previews with the same renderer that prints.
 */

const RECEIPT_LABELS: Record<OrderSummaryRowKind, string> = {
  subtotal: "Subtotal:",
  discount: "Discount:",
  service: "Service Charge:",
  delivery: "Delivery Fee:",
  total: "TOTAL:",
};

export interface ReceiptOrderItem {
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

export interface ReceiptOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  orderType?: string;
  total: number;
  deliveryFee?: number;
  paymentMethod?: string;
  items?: ReceiptOrderItem[];
  /** Cash handed over by the customer. Printed only alongside changeDue. */
  cashTendered?: number;
  /** Change handed back. Printed only alongside cashTendered (0 is valid). */
  changeDue?: number;
  /** Transaction reference for a scanned e-wallet payment. */
  paymentReference?: string;
  // Untyped on purpose: the discount breakdown rides in a free-form blob on
  // Convex and in a column on Postgres; `readOrderDiscount` shape-checks it.
  customerData?: unknown;
  customer_data?: unknown;
  discount_data?: unknown;
}

export interface ReceiptConfig {
  storeName: string;
  storeAddress?: string;
  width?: number; // characters per line, default 32
  /** Customer-facing tracking URL; the `qr` block is silent without it. */
  trackingUrl?: string;
}

export type ReceiptTextAlign = "left" | "center" | "right";

export type ReceiptBlock =
  | { kind: "divider"; char?: string }
  | { kind: "businessName" }
  | { kind: "storeAddress" }
  | { kind: "text"; text: string; align?: ReceiptTextAlign }
  | { kind: "orderMeta" }
  | { kind: "items" }
  | { kind: "itemsSummary" }
  | { kind: "totals" }
  | { kind: "contact" }
  | { kind: "qr" }
  | { kind: "feed" };

export type ReceiptBlockKind = ReceiptBlock["kind"];

export interface ReceiptLayout {
  version: 1;
  width?: number;
  blocks: ReceiptBlock[];
}

export type ReceiptPresetName = "classic" | "compact" | "detailed";

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** Byte-for-byte the historic `formatReceipt` output. */
export const CLASSIC_RECEIPT_LAYOUT: ReceiptLayout = {
  version: 1,
  blocks: [
    { kind: "divider", char: "=" },
    { kind: "businessName" },
    { kind: "storeAddress" },
    { kind: "divider", char: "=" },
    { kind: "orderMeta" },
    { kind: "items" },
    { kind: "totals" },
    { kind: "divider", char: "=" },
    { kind: "text", text: "Thank you!", align: "center" },
    { kind: "divider", char: "=" },
    { kind: "feed" },
  ],
};

/** Short slip: no header rules, item count instead of the full table. */
export const COMPACT_RECEIPT_LAYOUT: ReceiptLayout = {
  version: 1,
  blocks: [
    { kind: "businessName" },
    { kind: "orderMeta" },
    { kind: "items" },
    { kind: "totals" },
    { kind: "feed" },
  ],
};

/** Everything Classic prints plus the customer's contact and tracking QR. */
export const DETAILED_RECEIPT_LAYOUT: ReceiptLayout = {
  version: 1,
  blocks: [
    { kind: "divider", char: "=" },
    { kind: "businessName" },
    { kind: "storeAddress" },
    { kind: "divider", char: "=" },
    { kind: "orderMeta" },
    { kind: "contact" },
    { kind: "items" },
    { kind: "totals" },
    { kind: "qr" },
    { kind: "divider", char: "=" },
    { kind: "text", text: "Thank you!", align: "center" },
    { kind: "divider", char: "=" },
    { kind: "feed" },
  ],
};

const PRESETS: Record<ReceiptPresetName, ReceiptLayout> = {
  classic: CLASSIC_RECEIPT_LAYOUT,
  compact: COMPACT_RECEIPT_LAYOUT,
  detailed: DETAILED_RECEIPT_LAYOUT,
};

// ---------------------------------------------------------------------------
// Text helpers (shared with the historic formatter, moved here verbatim)
// ---------------------------------------------------------------------------

function center(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(padding) + text;
}

function rightAlign(text: string, width: number): string {
  return " ".repeat(Math.max(0, width - text.length)) + text;
}

function rule(char: string, width: number): string {
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

// ---------------------------------------------------------------------------
// Shared render context — computed once per receipt, used by several blocks
// ---------------------------------------------------------------------------

interface BundleGroup {
  name: string;
  items: ReceiptOrderItem[];
  total: number;
}

interface RenderContext {
  regularItems: ReceiptOrderItem[];
  bundles: Map<string, BundleGroup>;
  subtotal: number;
  discount: ReturnType<typeof readOrderDiscount>;
}

function buildContext(order: ReceiptOrder): RenderContext {
  const regularItems: ReceiptOrderItem[] = [];
  const bundles = new Map<string, BundleGroup>();
  let subtotal = 0;

  for (const item of order.items ?? []) {
    subtotal += item.subtotal;
    if (item.isBundleItem && item.bundleId) {
      const existing = bundles.get(item.bundleId);
      if (existing) {
        existing.items.push(item);
        existing.total += item.subtotal;
      } else {
        bundles.set(item.bundleId, {
          name: item.bundleName ?? "Bundle",
          items: [item],
          total: item.subtotal,
        });
      }
    } else {
      regularItems.push(item);
    }
  }

  return { regularItems, bundles, subtotal, discount: readOrderDiscount(order) };
}

// ---------------------------------------------------------------------------
// Block renderers
// ---------------------------------------------------------------------------

function itemLines(item: ReceiptOrderItem, w: number, slotPrefix = ""): string[] {
  const lines: string[] = [];
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

  return lines;
}

function renderOrderMeta(order: ReceiptOrder, w: number): string[] {
  const lines: string[] = [];
  const orderNum = order._id.slice(-8).toUpperCase();
  const date = new Date(order._creationTime);
  const dateStr = date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

  lines.push(`Order #: ${orderNum}`);
  lines.push(`Date: ${dateStr}  ${timeStr}`);
  lines.push(truncate(`Customer: ${order.customerName}`, w));
  if (order.orderType) {
    lines.push(truncate(`Type: ${order.orderType}`, w));
  }
  return lines;
}

function renderItems(ctx: RenderContext, w: number): string[] {
  const lines: string[] = [];
  lines.push(rule("-", w));
  lines.push(leftRight("Qty  Item", "Amount", w));
  lines.push(rule("-", w));

  for (const item of ctx.regularItems) {
    lines.push(...itemLines(item, w));
  }

  for (const [, bundle] of ctx.bundles) {
    lines.push("");
    lines.push(`*** BUNDLE: ${bundle.name} ***`);
    for (const item of bundle.items) {
      lines.push(...itemLines(item, w, item.slotName ? `[${item.slotName}] ` : ""));
    }
    lines.push(leftRight("  Bundle Total:", `P${bundle.total.toFixed(2)}`, w));
  }

  return lines;
}

function renderTotals(order: ReceiptOrder, ctx: RenderContext, w: number): string[] {
  const lines: string[] = [];

  // Validate the computed subtotal against order.total. The discount must be
  // part of this sum — otherwise every discounted sale trips the warning and
  // trains merchants to ignore the one signal meant to catch real corruption.
  const expectedTotal = ctx.subtotal + (order.deliveryFee ?? 0) - (ctx.discount?.total ?? 0);
  if (Math.abs(expectedTotal - order.total) > 0.01) {
    console.warn(
      `[Receipt] Subtotal mismatch: computed=${expectedTotal.toFixed(2)} vs order.total=${order.total.toFixed(2)} (order ${order._id})`
    );
  }

  lines.push(rule("-", w));

  // Which rows appear is decided by `orderSummaryRows`, shared with the order
  // screens. Only the wording and the column layout are the receipt's own.
  const summaryRows = orderSummaryRows({
    subtotal: ctx.subtotal,
    deliveryFee: order.deliveryFee,
    discount: ctx.discount,
    total: order.total,
  });

  // The total is printed straight from `order.total` — the backend's
  // authoritative figure — never a recomputed sum.
  for (const row of summaryRows.filter((r) => r.kind !== "total")) {
    if (row.kind === "discount") {
      // The label is merchant-authored (a voucher name), so it is clipped to
      // leave room for the amount rather than trusted to fit.
      const amount = `-P${row.amount.toFixed(2)}`;
      lines.push(leftRight(truncate(row.label, Math.max(0, w - amount.length - 1)), amount, w));
      continue;
    }
    lines.push(leftRight(RECEIPT_LABELS[row.kind], `P${row.amount.toFixed(2)}`, w));
  }

  lines.push(rule("-", w));
  lines.push(leftRight("TOTAL:", `P${order.total.toFixed(2)}`, w));
  if (order.paymentMethod) {
    lines.push(`Payment: ${order.paymentMethod}`);
  }

  // POS cash block. Both halves are required — printing a tender without the
  // change owed (or vice versa) would be worse than printing neither.
  if (order.cashTendered !== undefined && order.changeDue !== undefined) {
    lines.push(leftRight("CASH:", `P${order.cashTendered.toFixed(2)}`, w));
    lines.push(leftRight("CHANGE:", `P${order.changeDue.toFixed(2)}`, w));
  }

  if (order.paymentReference) {
    lines.push(truncate(`Ref: ${order.paymentReference}`, w));
  }

  return lines;
}

const PLACEHOLDER_CONTACTS = new Set(["", "n/a", "na", "-"]);

function renderContact(order: ReceiptOrder, w: number): string[] {
  const contact = order.customerContact?.trim() ?? "";
  if (PLACEHOLDER_CONTACTS.has(contact.toLowerCase())) return [];
  return [truncate(`Contact: ${contact}`, w)];
}

function renderQr(config: ReceiptConfig, w: number): string[] {
  if (!config.trackingUrl) return [];
  return [
    truncate(center("Scan to track your order", w), w),
    truncate(config.trackingUrl, w),
  ];
}

function renderText(block: { text: string; align?: ReceiptTextAlign }, w: number): string[] {
  const text = truncate(block.text, w);
  if (block.align === "center") return [center(text, w)];
  if (block.align === "right") return [rightAlign(text, w)];
  return [text];
}

// ---------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------

export function renderReceipt(
  order: ReceiptOrder,
  config: ReceiptConfig,
  layout: ReceiptLayout,
): string {
  const w = layout.width ?? config.width ?? 32;
  const ctx = buildContext(order);
  const lines: string[] = [];

  for (const block of layout.blocks) {
    switch (block.kind) {
      case "divider":
        lines.push(rule(block.char ?? "=", w));
        break;
      case "businessName":
        lines.push(center(truncate(config.storeName.toUpperCase(), w), w));
        break;
      case "storeAddress":
        if (config.storeAddress) lines.push(center(truncate(config.storeAddress, w), w));
        break;
      case "text":
        lines.push(...renderText(block, w));
        break;
      case "orderMeta":
        lines.push(...renderOrderMeta(order, w));
        break;
      case "items":
        lines.push(...renderItems(ctx, w));
        break;
      case "itemsSummary": {
        const count = (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
        lines.push(`Items: ${count}`);
        break;
      }
      case "totals":
        lines.push(...renderTotals(order, ctx, w));
        break;
      case "contact":
        lines.push(...renderContact(order, w));
        break;
      case "qr":
        lines.push(...renderQr(config, w));
        break;
      case "feed":
        lines.push("");
        break;
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Untrusted-input validation (tenant JSONB → layout)
// ---------------------------------------------------------------------------

const TEXT_ALIGNS: readonly ReceiptTextAlign[] = ["left", "center", "right"];
const SIMPLE_BLOCK_KINDS: readonly ReceiptBlockKind[] = [
  "businessName",
  "storeAddress",
  "orderMeta",
  "items",
  "itemsSummary",
  "totals",
  "contact",
  "qr",
  "feed",
];

function parseBlock(value: unknown): ReceiptBlock | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  if (raw.kind === "divider") {
    if (raw.char !== undefined && (typeof raw.char !== "string" || raw.char.length !== 1)) {
      return null;
    }
    return { kind: "divider", ...(raw.char !== undefined ? { char: raw.char as string } : {}) };
  }

  if (raw.kind === "text") {
    if (typeof raw.text !== "string" || raw.text.length === 0) return null;
    if (raw.align !== undefined && !TEXT_ALIGNS.includes(raw.align as ReceiptTextAlign)) {
      return null;
    }
    return {
      kind: "text",
      text: raw.text,
      ...(raw.align !== undefined ? { align: raw.align as ReceiptTextAlign } : {}),
    };
  }

  if (SIMPLE_BLOCK_KINDS.includes(raw.kind as ReceiptBlockKind)) {
    return { kind: raw.kind as Exclude<ReceiptBlockKind, "divider" | "text"> };
  }

  return null;
}

/**
 * Shape-check an untrusted layout value. Returns null on anything invalid —
 * callers fall back to Classic rather than printing a partial receipt.
 */
export function parseReceiptLayout(value: unknown): ReceiptLayout | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;
  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) return null;
  if (raw.width !== undefined && (typeof raw.width !== "number" || raw.width < 20 || raw.width > 64)) {
    return null;
  }

  const blocks: ReceiptBlock[] = [];
  for (const entry of raw.blocks) {
    const block = parseBlock(entry);
    if (!block) return null;
    blocks.push(block);
  }

  return {
    version: 1,
    blocks,
    ...(raw.width !== undefined ? { width: raw.width as number } : {}),
  };
}

/**
 * Resolve whatever a tenant row carries (nothing, a preset name, or a custom
 * layout object) into a printable layout. Never throws; never returns an
 * unprintable layout.
 */
export function resolveReceiptLayout(value: unknown): ReceiptLayout {
  if (typeof value === "string") {
    return PRESETS[value as ReceiptPresetName] ?? CLASSIC_RECEIPT_LAYOUT;
  }
  return parseReceiptLayout(value) ?? CLASSIC_RECEIPT_LAYOUT;
}

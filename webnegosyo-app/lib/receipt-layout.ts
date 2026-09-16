import { readOrderDiscount } from "./order-discount";
import { orderSummaryRows, type OrderSummaryRowKind } from "./order-summary-rows";
import { getOrderTableNumber } from "./order-table-number";

/**
 * Block-based receipt rendering.
 *
 * A tenant's receipt is a stack of blocks rendered top to bottom. The Classic
 * preset reproduces the historic `formatReceipt` output byte-for-byte — every
 * tenant without a saved layout prints exactly what they always have. Layouts
 * arrive as untrusted JSON from the `tenants.receipt_layout` column, so
 * everything goes through `parseReceiptLayout` / `resolveReceiptLayout` and an
 * invalid layout falls back to Modern rather than printing a broken receipt.
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
  /**
   * The service charge already inside `total`. Absent for an unserviced order
   * AND for every order placed before the figure was stored, so the row is
   * drawn only when there is something true to say.
   */
  serviceCharge?: number;
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
  /** Store logo image URL; the `logo` block is silent without it. */
  logoUrl?: string;
}

export type ReceiptTextAlign = "left" | "center" | "right";

export type ReceiptBlock =
  | { kind: "divider"; char?: string }
  | { kind: "businessName" }
  | { kind: "storeAddress" }
  | { kind: "logo" }
  | { kind: "text"; text: string; align?: ReceiptTextAlign }
  | { kind: "orderMeta" }
  | { kind: "orderNumber"; label?: string }
  | { kind: "orderDate"; label?: string }
  | { kind: "customerName"; label?: string }
  | { kind: "orderType"; label?: string }
  | { kind: "tableNumber"; label?: string }
  | { kind: "fillIn"; label: string }
  | { kind: "items" }
  | { kind: "itemsSummary" }
  | { kind: "totals" }
  | { kind: "contact" }
  | { kind: "qr" }
  | { kind: "feed" };

export type ReceiptBlockKind = ReceiptBlock["kind"];

/**
 * How the blocks are styled. `classic` is the flat 32-column slip every store
 * printed before themes existed; `modern` uses the printer's bold, tall, wide
 * and centred text. A layout that names no theme is modern.
 */
export type ReceiptTheme = "classic" | "modern";

export const RECEIPT_THEMES: readonly ReceiptTheme[] = ["classic", "modern"];

export interface ReceiptLayout {
  version: 1;
  width?: number;
  theme?: ReceiptTheme;
  blocks: ReceiptBlock[];
}

export type ReceiptPresetName = "modern" | "classic" | "compact" | "detailed";

// ---------------------------------------------------------------------------
// Inline markup
//
// Styled lines carry `<C>` (centre), `<R>` (right), `<B>` (bold), `<H>`
// (double height) and `<W>` (double width and height). The printer path turns
// them into control bytes (webnegosyo-app/lib/receipt-escpos.ts); flat
// surfaces flatten them with `flattenReceiptMarkup`. Classic emits none.
// ---------------------------------------------------------------------------

const MARKUP_TAG = /<\/?[CRBHW]>/g;

export function stripReceiptMarkup(text: string): string {
  return text.replace(MARKUP_TAG, "");
}

/**
 * Markup → plain text for previews and browser printing: tags are removed and
 * a line that opened centred or right-aligned is padded with spaces instead,
 * so the flat rendering keeps the shape of the paper.
 */
export function flattenReceiptMarkup(text: string, width: number): string {
  return text
    .split("\n")
    .map((line) => {
      const plain = stripReceiptMarkup(line);
      if (line.startsWith("<C>")) return center(plain, width);
      if (line.startsWith("<R>")) return rightAlign(plain, width);
      return plain;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * The default: logo and name up top, a headline order number, clean item
 * rows, a tall bold total, and the tracking QR. Every store without a saved
 * layout prints this.
 */
export const MODERN_RECEIPT_LAYOUT: ReceiptLayout = {
  version: 1,
  theme: "modern",
  blocks: [
    { kind: "logo" },
    { kind: "businessName" },
    { kind: "storeAddress" },
    { kind: "feed" },
    { kind: "orderNumber" },
    { kind: "orderDate" },
    { kind: "orderType" },
    { kind: "customerName" },
    { kind: "divider", char: "-" },
    { kind: "items" },
    { kind: "totals" },
    { kind: "feed" },
    { kind: "qr" },
    { kind: "feed" },
    { kind: "text", text: "Thank you! Please come again.", align: "center" },
    { kind: "feed" },
  ],
};

/** Byte-for-byte the historic `formatReceipt` output. */
export const CLASSIC_RECEIPT_LAYOUT: ReceiptLayout = {
  version: 1,
  theme: "classic",
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
  modern: MODERN_RECEIPT_LAYOUT,
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

/**
 * Break `text` into lines that fit the paper instead of clipping it. Names are
 * merchant-authored and are the one thing a customer reads to check their
 * order, so nothing is ever cut: we break at a space where one is available and
 * hard-split a word too long to fit a line of its own. The first line may be
 * narrower than the rest — an item line gives up columns to the quantity and
 * the price, and only the continuation lines get the full name column.
 */
function wrapText(text: string, firstWidth: number, restWidth: number): string[] {
  const rest = Math.max(1, Math.floor(restWidth));
  const lines: string[] = [];
  let remaining = text;
  let width = Math.max(0, Math.floor(firstWidth));

  while (remaining.length > 0) {
    // No room left on this line at all (a price that eats the whole width):
    // start the name on the next, full-width line rather than dropping it.
    if (width < 1) {
      lines.push("");
      width = rest;
      continue;
    }
    if (remaining.length <= width) {
      lines.push(remaining);
      break;
    }
    // Look one character past the window so a break landing exactly on the
    // boundary space still counts as a clean word break.
    const breakAt = remaining.slice(0, width + 1).lastIndexOf(" ");
    const cut = breakAt > 0 ? breakAt : width;
    lines.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
    width = rest;
  }

  return lines.length > 0 ? lines : [""];
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
  // The name column starts after the quantity; continuation lines line up
  // under it so a wrapped name still reads as one item.
  const indent = " ".repeat(qtyStr.length + 2);
  const [firstLine, ...restLines] = wrapText(fullName, nameMaxLen, w - indent.length);

  lines.push(leftRight(`${qtyStr}  ${firstLine}`, priceStr, w));
  for (const part of restLines) lines.push(`${indent}${part}`);

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

// The granular detail blocks and the composite `orderMeta` share these line
// builders, so stacking the four details reproduces orderMeta byte-for-byte.

function orderNumberLine(order: ReceiptOrder, label: string): string {
  return `${label}: ${order._id.slice(-8).toUpperCase()}`;
}

function orderDateLine(order: ReceiptOrder, label: string): string {
  const date = new Date(order._creationTime);
  const dateStr = date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  return `${label}: ${dateStr}  ${timeStr}`;
}

function customerNameLine(order: ReceiptOrder, label: string, w: number): string {
  return truncate(`${label}: ${order.customerName}`, w);
}

/** Empty when the order carries no type — the block simply prints nothing. */
function orderTypeLines(order: ReceiptOrder, label: string, w: number): string[] {
  return order.orderType ? [truncate(`${label}: ${order.orderType}`, w)] : [];
}

/**
 * Empty when no table was captured. Reads whichever blob the order carries —
 * camelCase from Convex, snake_case from a Postgres row.
 */
function tableNumberLines(order: ReceiptOrder, label: string, w: number): string[] {
  const table = getOrderTableNumber(order.customerData ?? order.customer_data);
  return table ? [truncate(`${label}: ${table}`, w)] : [];
}

/** "Label: ______" — a rule the customer writes on, out to the paper edge. */
function fillInLine(label: string, w: number): string {
  const prefix = truncate(`${label}: `, w);
  return prefix + "_".repeat(Math.max(0, w - prefix.length));
}

function renderOrderMeta(order: ReceiptOrder, w: number): string[] {
  return [
    orderNumberLine(order, "Order #"),
    orderDateLine(order, "Date"),
    customerNameLine(order, "Customer", w),
    ...orderTypeLines(order, "Type", w),
    ...tableNumberLines(order, "Table", w),
  ];
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
    for (const part of wrapText(`*** BUNDLE: ${bundle.name} ***`, w, w)) lines.push(part);
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
  // The service charge belongs in this sum for the same reason the discount
  // does: omit it and every serviced order cries corruption at a merchant who
  // has none, training them to ignore the one signal meant to catch the real
  // thing.
  const expectedTotal =
    ctx.subtotal +
    (order.deliveryFee ?? 0) +
    (order.serviceCharge ?? 0) -
    (ctx.discount?.total ?? 0);
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
    serviceCharge: order.serviceCharge,
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

function renderText(block: { text: string; align?: ReceiptTextAlign }, w: number): string[] {
  const text = truncate(block.text, w);
  if (block.align === "center") return [center(text, w)];
  if (block.align === "right") return [rightAlign(text, w)];
  return [text];
}

// ---------------------------------------------------------------------------
// Modern theme renderers
// ---------------------------------------------------------------------------

/** The widest a double-width line can be: half the columns. */
function heroLine(text: string, w: number): string {
  if (text.length <= Math.floor(w / 2)) return `<C><W><B>${text}</B></W></C>`;
  return `<C><H><B>${truncate(text, w)}</B></H></C>`;
}

function headline(text: string, w: number): string {
  return `<C><H><B>${truncate(text, w)}</B></H></C>`;
}

function centered(text: string, w: number): string {
  return `<C>${truncate(text, w)}</C>`;
}

/** "Order #A1B2C3D4" — a label ending in "#" hugs the number. */
function modernOrderNumberText(order: ReceiptOrder, label: string): string {
  const id = order._id.slice(-8).toUpperCase();
  return label.endsWith("#") ? `${label}${id}` : `${label} #${id}`;
}

function modernDateText(order: ReceiptOrder): string {
  const date = new Date(order._creationTime);
  const dateStr = date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  return `${dateStr}  ${timeStr}`;
}

/** A merchant-renamed label is kept; the default one gives way to the value. */
function labelled(label: string | undefined, value: string): string {
  return label === undefined ? value : `${label}: ${value}`;
}

/** "Dine-in  ·  Table 4" — whichever halves the order carries. */
function modernTypeAndTable(order: ReceiptOrder, typeLabel?: string, tableLabel?: string): string[] {
  const table = getOrderTableNumber(order.customerData ?? order.customer_data);
  const parts = [
    ...(order.orderType ? [labelled(typeLabel, order.orderType)] : []),
    ...(table ? [labelled(tableLabel, `Table ${table}`)] : []),
  ];
  return parts.length > 0 ? [parts.join("  ·  ")] : [];
}

function renderModernOrderMeta(order: ReceiptOrder, w: number): string[] {
  return [
    headline(modernOrderNumberText(order, "Order #"), w),
    centered(modernDateText(order), w),
    ...modernTypeAndTable(order).map((line) => centered(line, w)),
    centered(`Customer: ${order.customerName}`, w),
  ];
}

const MODERN_INDENT = "    ";

function modernItemLines(item: ReceiptOrderItem, w: number, slotPrefix = ""): string[] {
  const qtyStr = `${item.quantity}x`.padEnd(3);
  const priceStr = `P${item.subtotal.toFixed(2)}`;
  const fullName = `${slotPrefix}${item.menuItemName}`;
  const nameMaxLen = Math.max(0, w - qtyStr.length - priceStr.length - 2);
  const indent = " ".repeat(qtyStr.length + 1);
  const [firstLine, ...restLines] = wrapText(fullName, nameMaxLen, w - indent.length);

  const lines = [leftRight(`${qtyStr} ${firstLine}`, priceStr, w)];
  for (const part of restLines) lines.push(`${indent}${part}`);
  if (item.variationSelections && item.variationSelections.length > 0) {
    for (const sel of item.variationSelections) lines.push(`${MODERN_INDENT}${sel.optionName}`);
  } else if (item.variation) {
    lines.push(`${MODERN_INDENT}${item.variation}`);
  }
  for (const addon of item.addons ?? []) lines.push(`${MODERN_INDENT}+ ${addon.name}`);
  if (item.specialInstructions) lines.push(`${MODERN_INDENT}Note: ${item.specialInstructions}`);
  return lines;
}

function renderModernItems(ctx: RenderContext, w: number): string[] {
  const lines: string[] = [];
  for (const item of ctx.regularItems) lines.push(...modernItemLines(item, w));
  for (const [, bundle] of ctx.bundles) {
    lines.push("");
    for (const part of wrapText(`Bundle: ${bundle.name}`, w, w)) lines.push(`<B>${part}</B>`);
    for (const item of bundle.items) {
      lines.push(...modernItemLines(item, w, item.slotName ? `[${item.slotName}] ` : ""));
    }
    lines.push(leftRight(`${MODERN_INDENT}Bundle total`, `P${bundle.total.toFixed(2)}`, w));
  }
  return lines;
}

const MODERN_LABELS: Record<OrderSummaryRowKind, string> = {
  subtotal: "Subtotal",
  discount: "Discount",
  service: "Service charge",
  delivery: "Delivery fee",
  total: "TOTAL",
};

function renderModernTotals(order: ReceiptOrder, ctx: RenderContext, w: number): string[] {
  const lines: string[] = [rule("-", w)];
  const summaryRows = orderSummaryRows({
    subtotal: ctx.subtotal,
    deliveryFee: order.deliveryFee,
    serviceCharge: order.serviceCharge,
    discount: ctx.discount,
    total: order.total,
  });
  for (const row of summaryRows.filter((r) => r.kind !== "total")) {
    if (row.kind === "discount") {
      const amount = `-P${row.amount.toFixed(2)}`;
      lines.push(leftRight(truncate(row.label, Math.max(0, w - amount.length - 1)), amount, w));
      continue;
    }
    lines.push(leftRight(MODERN_LABELS[row.kind], `P${row.amount.toFixed(2)}`, w));
  }
  lines.push(rule("-", w));
  // Straight from `order.total`, the backend's figure — never a recomputed sum.
  lines.push(`<H><B>${leftRight("TOTAL", `P${order.total.toFixed(2)}`, w)}</B></H>`);

  if (order.paymentMethod) {
    lines.push(leftRight("Payment", truncate(order.paymentMethod, Math.max(0, w - 8)), w));
  }
  if (order.cashTendered !== undefined && order.changeDue !== undefined) {
    lines.push(leftRight("Cash", `P${order.cashTendered.toFixed(2)}`, w));
    lines.push(leftRight("Change", `P${order.changeDue.toFixed(2)}`, w));
  }
  if (order.paymentReference) lines.push(truncate(`Ref: ${order.paymentReference}`, w));
  return lines;
}

function renderModernText(block: { text: string; align?: ReceiptTextAlign }, w: number): string[] {
  const text = truncate(block.text, w);
  if (block.align === "center") return [`<C>${text}</C>`];
  if (block.align === "right") return [`<R>${text}</R>`];
  return [text];
}

/** What a layout prints with: absent means modern. */
export function resolveReceiptTheme(
  layout: ReceiptLayout | Pick<ReceiptLayout, "theme">,
): ReceiptTheme {
  return layout.theme ?? "modern";
}

// ---------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------

/**
 * A receipt split for the printer: text goes through printBill, each QR is a
 * raster sent through printImageBase64. Contiguous text collapses into single
 * segments so the printer gets the fewest possible writes.
 */
export type ReceiptSegment =
  | { type: "text"; text: string }
  | { type: "qr"; data: string }
  | { type: "image"; url: string };

export function renderReceiptSegments(
  order: ReceiptOrder,
  config: ReceiptConfig,
  layout: ReceiptLayout,
): ReceiptSegment[] {
  const w = layout.width ?? config.width ?? 32;
  const isModern = resolveReceiptTheme(layout) === "modern";
  const ctx = buildContext(order);
  const segments: ReceiptSegment[] = [];
  let lines: string[] = [];

  const flushText = () => {
    if (lines.length === 0) return;
    segments.push({ type: "text", text: lines.join("\n") });
    lines = [];
  };

  for (const block of layout.blocks) {
    switch (block.kind) {
      case "divider":
        lines.push(rule(block.char ?? "=", w));
        break;
      case "businessName":
        lines.push(
          isModern
            ? heroLine(config.storeName.toUpperCase(), w)
            : center(truncate(config.storeName.toUpperCase(), w), w),
        );
        break;
      case "storeAddress":
        if (config.storeAddress) {
          lines.push(
            isModern ? centered(config.storeAddress, w) : center(truncate(config.storeAddress, w), w),
          );
        }
        break;
      case "logo":
        if (config.logoUrl) {
          flushText();
          segments.push({ type: "image", url: config.logoUrl });
        }
        break;
      case "text":
        lines.push(...(isModern ? renderModernText(block, w) : renderText(block, w)));
        break;
      case "orderMeta":
        lines.push(...(isModern ? renderModernOrderMeta(order, w) : renderOrderMeta(order, w)));
        break;
      case "orderNumber":
        lines.push(
          isModern
            ? headline(modernOrderNumberText(order, block.label ?? "Order #"), w)
            : orderNumberLine(order, block.label ?? "Order #"),
        );
        break;
      case "orderDate":
        lines.push(
          isModern
            ? centered(labelled(block.label, modernDateText(order)), w)
            : orderDateLine(order, block.label ?? "Date"),
        );
        break;
      case "customerName":
        lines.push(
          isModern
            ? centered(`${block.label ?? "Customer"}: ${order.customerName}`, w)
            : customerNameLine(order, block.label ?? "Customer", w),
        );
        break;
      case "orderType":
        if (isModern) {
          // The type and the table share one centred line when both are set;
          // a following tableNumber block then has nothing left to print.
          lines.push(...modernTypeAndTable(order, block.label).map((line) => centered(line, w)));
        } else {
          lines.push(...orderTypeLines(order, block.label ?? "Type", w));
        }
        break;
      case "tableNumber":
        if (isModern) {
          if (!layout.blocks.some((b) => b.kind === "orderType" || b.kind === "orderMeta")) {
            const table = getOrderTableNumber(order.customerData ?? order.customer_data);
            if (table) lines.push(centered(labelled(block.label, `Table ${table}`), w));
          }
        } else {
          lines.push(...tableNumberLines(order, block.label ?? "Table", w));
        }
        break;
      case "fillIn":
        lines.push(fillInLine(block.label, w));
        break;
      case "items":
        lines.push(...(isModern ? renderModernItems(ctx, w) : renderItems(ctx, w)));
        break;
      case "itemsSummary": {
        const count = (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
        lines.push(`Items: ${count}`);
        break;
      }
      case "totals":
        lines.push(...(isModern ? renderModernTotals(order, ctx, w) : renderTotals(order, ctx, w)));
        break;
      case "contact":
        lines.push(...renderContact(order, w));
        break;
      case "qr":
        if (config.trackingUrl) {
          lines.push(
            isModern
              ? "<C><B>Scan to track your order</B></C>"
              : truncate(center("Scan to track your order", w), w),
          );
          flushText();
          segments.push({ type: "qr", data: config.trackingUrl });
        }
        break;
      case "feed":
        lines.push("");
        break;
    }
  }

  flushText();
  return segments;
}

/**
 * Flat-text rendering — previews and printers with no raster support. The QR
 * degrades to its URL printed as text, so a phone can still type it in.
 */
export function renderReceipt(
  order: ReceiptOrder,
  config: ReceiptConfig,
  layout: ReceiptLayout,
): string {
  const w = layout.width ?? config.width ?? 32;
  return renderReceiptSegments(order, config, layout)
    // A logo cannot degrade to text the way a QR degrades to its URL — flat
    // surfaces (previews, browser print) simply skip it.
    .filter((segment) => segment.type !== "image")
    .map((segment) => {
      if (segment.type === "text") return flattenReceiptMarkup(segment.text, w);
      // Wrap rather than truncate: a clipped URL cannot be typed into a phone.
      const wrapped: string[] = [];
      for (let i = 0; i < segment.data.length; i += w) {
        wrapped.push(segment.data.slice(i, i + w));
      }
      return wrapped.join("\n");
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Untrusted-input validation (tenant JSONB → layout)
// ---------------------------------------------------------------------------

const TEXT_ALIGNS: readonly ReceiptTextAlign[] = ["left", "center", "right"];
const SIMPLE_BLOCK_KINDS: readonly ReceiptBlockKind[] = [
  "businessName",
  "storeAddress",
  "logo",
  "orderMeta",
  "items",
  "itemsSummary",
  "totals",
  "contact",
  "qr",
  "feed",
];

/** Detail blocks whose printed label the merchant may rename. */
const LABELED_DETAIL_KINDS = [
  "orderNumber",
  "orderDate",
  "customerName",
  "orderType",
  "tableNumber",
] as const;
const MAX_LABEL_LENGTH = 32;

function isValidLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_LABEL_LENGTH;
}

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

  if (LABELED_DETAIL_KINDS.includes(raw.kind as (typeof LABELED_DETAIL_KINDS)[number])) {
    if (raw.label !== undefined && !isValidLabel(raw.label)) return null;
    return {
      kind: raw.kind as (typeof LABELED_DETAIL_KINDS)[number],
      ...(raw.label !== undefined ? { label: raw.label as string } : {}),
    };
  }

  if (raw.kind === "fillIn") {
    if (!isValidLabel(raw.label)) return null;
    return { kind: "fillIn", label: raw.label };
  }

  if (SIMPLE_BLOCK_KINDS.includes(raw.kind as ReceiptBlockKind)) {
    return {
      kind: raw.kind as Exclude<
        ReceiptBlockKind,
        "divider" | "text" | "fillIn" | (typeof LABELED_DETAIL_KINDS)[number]
      >,
    };
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
  if (raw.theme !== undefined && !RECEIPT_THEMES.includes(raw.theme as ReceiptTheme)) {
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
    ...(raw.theme !== undefined ? { theme: raw.theme as ReceiptTheme } : {}),
  };
}

/**
 * Resolve whatever a tenant row carries (nothing, a preset name, or a custom
 * layout object) into a printable layout. Never throws; never returns an
 * unprintable layout. Nothing saved means Modern; a layout that cannot be
 * parsed falls back to Classic, the one output every printer has proven.
 */
export function resolveReceiptLayout(value: unknown): ReceiptLayout {
  if (value === null || value === undefined) return MODERN_RECEIPT_LAYOUT;
  if (typeof value === "string") {
    return PRESETS[value as ReceiptPresetName] ?? MODERN_RECEIPT_LAYOUT;
  }
  // A corrupt column prints the same slip as an empty one: nobody chose
  // Classic by saving something unreadable.
  return parseReceiptLayout(value) ?? MODERN_RECEIPT_LAYOUT;
}

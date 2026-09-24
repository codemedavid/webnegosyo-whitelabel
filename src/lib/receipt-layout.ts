import {
  DELIVERY_ADDRESS_FIELD_NAME,
  buildCustomerDetailRows,
  type CustomerDetailRow,
} from "./customer-details";
import { readOrderDiscount } from "./order-discount";
import { orderSummaryRows, type OrderSummaryRowKind } from "./order-summary-rows";
import { TABLE_NUMBER_FIELD_NAME, getOrderTableNumber } from "./order-table-number";

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
 * Mirror (deliberate duplication, like `qr-order-codec.ts`) of
 * `webnegosyo-app/lib/receipt-layout.ts` — the app is the printing side, this
 * copy drives the admin editor preview and the web print view. Keep in sync.
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

/**
 * How big a styled line prints. `tall` is the printer's double height (same
 * columns); `large` is double width and height, so a line holds half as many
 * characters and the engine wraps at half the paper width.
 */
export type ReceiptTextSize = "normal" | "tall" | "large";

export const RECEIPT_TEXT_SIZES: readonly ReceiptTextSize[] = ["normal", "tall", "large"];

/**
 * A merchant's styling for one block. Every field is optional and merges over
 * what the theme prints by default (`defaultBlockStyle`). A block without a
 * style renders exactly as it did before styles existed, and an app build that
 * predates styles drops the field and prints the block unstyled.
 */
export interface ReceiptBlockStyle {
  size?: ReceiptTextSize;
  bold?: boolean;
  align?: ReceiptTextAlign;
}

type ReceiptBlockShape =
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
  | { kind: "deliveryAddress"; label?: string }
  | { kind: "customerDetails" }
  | { kind: "fillIn"; label: string }
  | { kind: "items" }
  | { kind: "itemsSummary" }
  | { kind: "totals" }
  | { kind: "contact" }
  | { kind: "qr" }
  | { kind: "feed" };

export type ReceiptBlock = ReceiptBlockShape & { style?: ReceiptBlockStyle };

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
  /** Print every line bold — darker on a faint or worn thermal head. */
  bold?: boolean;
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

// ---------------------------------------------------------------------------
// What the customer filled in at checkout
//
// The extra fields a merchant's checkout asks for live in the order's free-form
// blob, keyed by the field's internal name. `buildCustomerDetailRows` — shared
// with the app's order screen — is what decides which of them a human should
// ever read: the platform's own carrier keys (the branch id, the raw schedule
// instant, the map coordinates) are dropped there, once, for both surfaces.
// ---------------------------------------------------------------------------

/** Continuation indent for a wrapped answer, so it reads under its label. */
const DETAIL_INDENT = "  ";

function customerDetailRows(order: ReceiptOrder): CustomerDetailRow[] {
  const blob = order.customerData ?? order.customer_data;
  if (typeof blob !== "object" || blob === null) return [];
  return buildCustomerDetailRows(blob as Record<string, unknown>);
}

/**
 * The address row, or null when the order has none.
 *
 * The reserved `delivery_address` name is the platform's own (the checkout
 * hangs its map widget and delivery-fee logic off it), but a merchant is free
 * to have built their address field under another name — so a field merely
 * *named* like an address is taken rather than printing a rider a slip with
 * no address on it.
 */
function addressRow(rows: CustomerDetailRow[]): CustomerDetailRow | null {
  return (
    rows.find((row) => row.key === DELIVERY_ADDRESS_FIELD_NAME) ??
    rows.find((row) => row.key.toLowerCase().includes("address")) ??
    null
  );
}

function detailLines(label: string, value: string, w: number): string[] {
  const [first, ...rest] = wrapText(`${label}: ${value}`, w, w - DETAIL_INDENT.length);
  return [first ?? "", ...rest.map((part) => `${DETAIL_INDENT}${part}`)];
}

function modernDetailLines(label: string, value: string, w: number): string[] {
  return wrapText(`${label}: ${value}`, w, w).map((line) => centered(line, w));
}

function renderDetailRow(row: CustomerDetailRow, w: number, isModern: boolean): string[] {
  return isModern
    ? modernDetailLines(row.label, row.value, w)
    : detailLines(row.label, row.value, w);
}

/**
 * Keys `customerDetails` must stay off: a detail another block in this layout
 * is already printing. Without this a layout with both an address block and
 * the catch-all printed the address twice.
 */
function coveredDetailKeys(
  layout: ReceiptLayout,
  isModern: boolean,
  addressKey: string | null,
): Set<string> {
  const covered = new Set<string>();
  const has = (kind: ReceiptBlockKind) => layout.blocks.some((block) => block.kind === kind);

  // Modern folds the table into the order-type line; classic gives it its own.
  if (has("orderMeta") || has("tableNumber") || (isModern && has("orderType"))) {
    covered.add(TABLE_NUMBER_FIELD_NAME);
  }
  if (addressKey && has("deliveryAddress")) covered.add(addressKey);

  return covered;
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

/** "Contact: …", or null when the order carries only a placeholder. */
function contactText(order: ReceiptOrder): string | null {
  const contact = order.customerContact?.trim() ?? "";
  if (PLACEHOLDER_CONTACTS.has(contact.toLowerCase())) return null;
  return `Contact: ${contact}`;
}

function renderContact(order: ReceiptOrder, w: number): string[] {
  const contact = contactText(order);
  return contact ? [truncate(contact, w)] : [];
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
// Block styles
//
// A styled block is rendered as plain content lines, wrapped to the columns
// its size leaves (half the paper for `large`), and then wrapped in markup.
// Unstyled blocks never take this path, so their output is unchanged.
// ---------------------------------------------------------------------------

/** Which sizes a block kind can print at, and whether it can be re-aligned. */
export interface ReceiptStyleSupport {
  sizes: readonly ReceiptTextSize[];
  align: boolean;
}

const TEXT_STYLE_SUPPORT: ReceiptStyleSupport = { sizes: RECEIPT_TEXT_SIZES, align: true };
/** A rule the customer writes on spans the paper, so it has nothing to align. */
const RULE_STYLE_SUPPORT: ReceiptStyleSupport = { sizes: RECEIPT_TEXT_SIZES, align: false };
/** Column blocks (qty, name, price) keep their width: double height at most. */
const COLUMN_STYLE_SUPPORT: ReceiptStyleSupport = { sizes: ["normal", "tall"], align: false };

/**
 * The blocks a merchant can style. Missing kinds (logo, QR, divider, blank
 * line, and the composite `orderMeta`) print as they always have.
 */
export const RECEIPT_STYLE_SUPPORT: Partial<Record<ReceiptBlockKind, ReceiptStyleSupport>> = {
  businessName: TEXT_STYLE_SUPPORT,
  storeAddress: TEXT_STYLE_SUPPORT,
  text: TEXT_STYLE_SUPPORT,
  orderNumber: TEXT_STYLE_SUPPORT,
  orderDate: TEXT_STYLE_SUPPORT,
  customerName: TEXT_STYLE_SUPPORT,
  orderType: TEXT_STYLE_SUPPORT,
  tableNumber: TEXT_STYLE_SUPPORT,
  deliveryAddress: TEXT_STYLE_SUPPORT,
  customerDetails: TEXT_STYLE_SUPPORT,
  contact: TEXT_STYLE_SUPPORT,
  itemsSummary: TEXT_STYLE_SUPPORT,
  fillIn: RULE_STYLE_SUPPORT,
  items: COLUMN_STYLE_SUPPORT,
  totals: COLUMN_STYLE_SUPPORT,
};

export type ResolvedBlockStyle = Required<ReceiptBlockStyle>;

/** Detail lines the Modern theme centres. */
const MODERN_CENTRED_KINDS: ReadonlySet<ReceiptBlockKind> = new Set<ReceiptBlockKind>([
  "storeAddress",
  "orderDate",
  "customerName",
  "orderType",
  "tableNumber",
  "deliveryAddress",
  "customerDetails",
]);

/**
 * What a block prints like when the merchant has not styled it — the values
 * a style merges over, and what the Studio shows as selected.
 */
export function defaultBlockStyle(
  target: ReceiptBlockKind | ReceiptBlock,
  theme: ReceiptTheme,
): ResolvedBlockStyle {
  const kind = typeof target === "string" ? target : target.kind;
  const isModern = theme === "modern";
  const plain: ResolvedBlockStyle = { size: "normal", bold: false, align: "left" };

  if (kind === "text") {
    const align = typeof target === "object" && target.kind === "text" ? target.align : undefined;
    return { ...plain, align: align ?? "left" };
  }
  if (kind === "businessName") {
    return { size: isModern ? "large" : "normal", bold: isModern, align: "center" };
  }
  if (kind === "storeAddress") return { ...plain, align: "center" };
  if (isModern && kind === "orderNumber") return { size: "tall", bold: true, align: "center" };
  if (isModern && MODERN_CENTRED_KINDS.has(kind)) return { ...plain, align: "center" };
  return plain;
}

function resolveBlockStyle(
  block: ReceiptBlock,
  style: ReceiptBlockStyle,
  support: ReceiptStyleSupport,
  env: BlockEnv,
): ResolvedBlockStyle {
  const defaults = defaultBlockStyle(block, env.isModern ? "modern" : "classic");
  let size = style.size ?? defaults.size;
  // Modern's auto hero: a name too wide for double width drops to tall.
  if (
    block.kind === "businessName" &&
    style.size === undefined &&
    env.isModern &&
    env.config.storeName.length > Math.floor(env.w / 2)
  ) {
    size = "tall";
  }
  if (!support.sizes.includes(size)) size = support.sizes[support.sizes.length - 1]!;
  const align = support.align ? (style.align ?? defaults.align) : defaults.align;
  return { size, bold: style.bold ?? defaults.bold, align };
}

/** Columns a line of this size holds — double width halves them. */
function columnsForSize(size: ReceiptTextSize, w: number): number {
  return size === "large" ? Math.max(1, Math.floor(w / 2)) : w;
}

/** Wrap one line in markup. Alignment stays outermost so it opens the line. */
function styleLine(text: string, style: ResolvedBlockStyle): string {
  if (text === "") return "";
  let out = text;
  if (style.bold) out = `<B>${out}</B>`;
  if (style.size === "tall") out = `<H>${out}</H>`;
  if (style.size === "large") out = `<W>${out}</W>`;
  if (style.align === "center") out = `<C>${out}</C>`;
  if (style.align === "right") out = `<R>${out}</R>`;
  return out;
}

/** Bold a finished line without displacing the alignment tag that opens it. */
function emboldenLine(line: string): string {
  if (line === "") return line;
  const align = /^<([CR])>/.exec(line)?.[1];
  if (align && line.endsWith(`</${align}>`)) {
    return `<${align}><B>${line.slice(3, -4)}</B></${align}>`;
  }
  return `<B>${line}</B>`;
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

/** One block's share of the receipt — what the Studio highlights on click. */
export interface ReceiptBlockRender {
  index: number;
  segments: ReceiptSegment[];
}

/** Everything a block renderer may read, computed once per receipt. */
interface BlockEnv {
  order: ReceiptOrder;
  config: ReceiptConfig;
  layout: ReceiptLayout;
  w: number;
  isModern: boolean;
  ctx: RenderContext;
  detailRows: CustomerDetailRow[];
  address: CustomerDetailRow | null;
  covered: Set<string>;
}

function buildEnv(order: ReceiptOrder, config: ReceiptConfig, layout: ReceiptLayout): BlockEnv {
  const isModern = resolveReceiptTheme(layout) === "modern";
  const detailRows = customerDetailRows(order);
  const address = addressRow(detailRows);
  return {
    order,
    config,
    layout,
    w: layout.width ?? config.width ?? 32,
    isModern,
    ctx: buildContext(order),
    detailRows,
    address,
    covered: coveredDetailKeys(layout, isModern, address?.key ?? null),
  };
}

function hasBlock(layout: ReceiptLayout, ...kinds: ReceiptBlockKind[]): boolean {
  return layout.blocks.some((block) => kinds.includes(block.kind));
}

function itemCount(order: ReceiptOrder): number {
  return (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
}

/** The lines an unstyled block prints — the pre-styles output, unchanged. */
function renderPlainBlockLines(block: ReceiptBlock, env: BlockEnv): string[] {
  const { order, config, w, isModern, ctx } = env;
  switch (block.kind) {
    case "divider":
      return [rule(block.char ?? "=", w)];
    case "businessName":
      return [
        isModern
          ? heroLine(config.storeName.toUpperCase(), w)
          : center(truncate(config.storeName.toUpperCase(), w), w),
      ];
    case "storeAddress":
      if (!config.storeAddress) return [];
      return [isModern ? centered(config.storeAddress, w) : center(truncate(config.storeAddress, w), w)];
    case "text":
      return isModern ? renderModernText(block, w) : renderText(block, w);
    case "orderMeta":
      return isModern ? renderModernOrderMeta(order, w) : renderOrderMeta(order, w);
    case "orderNumber":
      return [
        isModern
          ? headline(modernOrderNumberText(order, block.label ?? "Order #"), w)
          : orderNumberLine(order, block.label ?? "Order #"),
      ];
    case "orderDate":
      return [
        isModern
          ? centered(labelled(block.label, modernDateText(order)), w)
          : orderDateLine(order, block.label ?? "Date"),
      ];
    case "customerName":
      return [
        isModern
          ? centered(`${block.label ?? "Customer"}: ${order.customerName}`, w)
          : customerNameLine(order, block.label ?? "Customer", w),
      ];
    case "orderType":
      // Modern: the type and the table share one centred line when both are
      // set; a following tableNumber block then has nothing left to print.
      return isModern
        ? modernTypeAndTable(order, block.label).map((line) => centered(line, w))
        : orderTypeLines(order, block.label ?? "Type", w);
    case "tableNumber": {
      if (!isModern) return tableNumberLines(order, block.label ?? "Table", w);
      const text = modernTableText(block.label, env);
      return text ? [centered(text, w)] : [];
    }
    case "deliveryAddress":
      return env.address
        ? renderDetailRow({ ...env.address, label: block.label ?? "Address" }, w, isModern)
        : [];
    case "customerDetails":
      return env.detailRows
        .filter((row) => !env.covered.has(row.key))
        .flatMap((row) => renderDetailRow(row, w, isModern));
    case "fillIn":
      return [fillInLine(block.label, w)];
    case "items":
      return isModern ? renderModernItems(ctx, w) : renderItems(ctx, w);
    case "itemsSummary":
      return [`Items: ${itemCount(order)}`];
    case "totals":
      return isModern ? renderModernTotals(order, ctx, w) : renderTotals(order, ctx, w);
    case "contact":
      return renderContact(order, w);
    case "feed":
      return [""];
    default:
      // logo and qr are not text; renderBlock handles them.
      return [];
  }
}

/** Modern prints the table on the order-type line when that block exists. */
function modernTableText(label: string | undefined, env: BlockEnv): string | null {
  if (hasBlock(env.layout, "orderType", "orderMeta")) return null;
  const table = getOrderTableNumber(env.order.customerData ?? env.order.customer_data);
  return table ? labelled(label, `Table ${table}`) : null;
}

/** A styled text block's content, one entry per logical line, before wrapping. */
function styledContent(block: ReceiptBlock, env: BlockEnv): string[] {
  const { order, config, isModern } = env;
  switch (block.kind) {
    case "businessName":
      return [config.storeName.toUpperCase()];
    case "storeAddress":
      return config.storeAddress ? [config.storeAddress] : [];
    case "text":
      return [block.text];
    case "orderNumber":
      return [
        isModern
          ? modernOrderNumberText(order, block.label ?? "Order #")
          : orderNumberLine(order, block.label ?? "Order #"),
      ];
    case "orderDate":
      return [
        isModern
          ? labelled(block.label, modernDateText(order))
          : orderDateLine(order, block.label ?? "Date"),
      ];
    case "customerName":
      return [`${block.label ?? "Customer"}: ${order.customerName}`];
    case "orderType":
      if (isModern) return modernTypeAndTable(order, block.label);
      return order.orderType ? [`${block.label ?? "Type"}: ${order.orderType}`] : [];
    case "tableNumber": {
      if (isModern) {
        const text = modernTableText(block.label, env);
        return text ? [text] : [];
      }
      const table = getOrderTableNumber(order.customerData ?? order.customer_data);
      return table ? [`${block.label ?? "Table"}: ${table}`] : [];
    }
    case "deliveryAddress":
      return env.address ? [`${block.label ?? "Address"}: ${env.address.value}`] : [];
    case "customerDetails":
      return env.detailRows
        .filter((row) => !env.covered.has(row.key))
        .map((row) => `${row.label}: ${row.value}`);
    case "contact": {
      const contact = contactText(order);
      return contact ? [contact] : [];
    }
    case "itemsSummary":
      return [`Items: ${itemCount(order)}`];
    default:
      return [];
  }
}

function renderStyledBlockLines(
  block: ReceiptBlock,
  style: ReceiptBlockStyle,
  support: ReceiptStyleSupport,
  env: BlockEnv,
): string[] {
  const resolved = resolveBlockStyle(block, style, support, env);
  const { w, isModern, ctx, order } = env;

  if (block.kind === "items" || block.kind === "totals") {
    const lines =
      block.kind === "items"
        ? isModern ? renderModernItems(ctx, w) : renderItems(ctx, w)
        : isModern ? renderModernTotals(order, ctx, w) : renderTotals(order, ctx, w);
    return lines.map((line) => styleLine(line, resolved));
  }

  const columns = columnsForSize(resolved.size, w);
  if (block.kind === "fillIn") return [styleLine(fillInLine(block.label, columns), resolved)];

  return styledContent(block, env)
    .flatMap((text) => wrapText(text, columns, columns))
    .map((line) => styleLine(line, resolved));
}

/** One block as printer pieces: a text piece per line, or an image / QR. */
function renderBlock(block: ReceiptBlock, env: BlockEnv): ReceiptSegment[] {
  const pieces: ReceiptSegment[] = [];

  if (block.kind === "logo") {
    if (env.config.logoUrl) pieces.push({ type: "image", url: env.config.logoUrl });
  } else if (block.kind === "qr") {
    if (env.config.trackingUrl) {
      const caption = env.isModern
        ? "<C><B>Scan to track your order</B></C>"
        : truncate(center("Scan to track your order", env.w), env.w);
      pieces.push({ type: "text", text: caption }, { type: "qr", data: env.config.trackingUrl });
    }
  } else {
    const support = RECEIPT_STYLE_SUPPORT[block.kind];
    const lines =
      block.style && support
        ? renderStyledBlockLines(block, block.style, support, env)
        : renderPlainBlockLines(block, env);
    for (const text of lines) pieces.push({ type: "text", text });
  }

  if (!env.layout.bold) return pieces;
  return pieces.map((piece) =>
    piece.type === "text" ? { type: "text", text: emboldenLine(piece.text) } : piece,
  );
}

/** Merge runs of text pieces into single segments, one printer write each. */
function collapseSegments(pieces: ReceiptSegment[]): ReceiptSegment[] {
  const segments: ReceiptSegment[] = [];
  let lines: string[] = [];
  const flushText = () => {
    if (lines.length === 0) return;
    segments.push({ type: "text", text: lines.join("\n") });
    lines = [];
  };
  for (const piece of pieces) {
    if (piece.type === "text") {
      lines.push(piece.text);
    } else {
      flushText();
      segments.push(piece);
    }
  }
  flushText();
  return segments;
}

export function renderReceiptSegments(
  order: ReceiptOrder,
  config: ReceiptConfig,
  layout: ReceiptLayout,
): ReceiptSegment[] {
  const env = buildEnv(order, config, layout);
  return collapseSegments(layout.blocks.flatMap((block) => renderBlock(block, env)));
}

/**
 * The same receipt, kept apart per block — concatenated, it is exactly
 * `renderReceiptSegments`. The Studio uses it to map paper back to blocks.
 */
export function renderReceiptBlocks(
  order: ReceiptOrder,
  config: ReceiptConfig,
  layout: ReceiptLayout,
): ReceiptBlockRender[] {
  const env = buildEnv(order, config, layout);
  return layout.blocks.map((block, index) => ({
    index,
    segments: collapseSegments(renderBlock(block, env)),
  }));
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
  "customerDetails",
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
  "deliveryAddress",
] as const;
const MAX_LABEL_LENGTH = 32;

function isValidLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_LABEL_LENGTH;
}

/**
 * An untrusted style: null when invalid (the layout is refused), undefined
 * when it sets nothing (the block keeps its unstyled rendering).
 */
function parseBlockStyle(value: unknown): ReceiptBlockStyle | null | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.size !== undefined && !RECEIPT_TEXT_SIZES.includes(raw.size as ReceiptTextSize)) {
    return null;
  }
  if (raw.bold !== undefined && typeof raw.bold !== "boolean") return null;
  if (raw.align !== undefined && !TEXT_ALIGNS.includes(raw.align as ReceiptTextAlign)) return null;

  const style: ReceiptBlockStyle = {
    ...(raw.size !== undefined ? { size: raw.size as ReceiptTextSize } : {}),
    ...(raw.bold !== undefined ? { bold: raw.bold as boolean } : {}),
    ...(raw.align !== undefined ? { align: raw.align as ReceiptTextAlign } : {}),
  };
  return Object.keys(style).length > 0 ? style : undefined;
}

/** A block plus its style. A style on a kind that cannot be styled is dropped. */
function parseBlock(value: unknown): ReceiptBlock | null {
  const block = parseBlockShape(value);
  if (!block) return null;
  const rawStyle = (value as Record<string, unknown>).style;
  if (rawStyle === undefined || !RECEIPT_STYLE_SUPPORT[block.kind]) return block;
  const style = parseBlockStyle(rawStyle);
  if (style === null) return null;
  return style ? { ...block, style } : block;
}

function parseBlockShape(value: unknown): ReceiptBlock | null {
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
  if (raw.bold !== undefined && typeof raw.bold !== "boolean") return null;

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
    ...(raw.bold !== undefined ? { bold: raw.bold as boolean } : {}),
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

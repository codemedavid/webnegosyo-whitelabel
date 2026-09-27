import {
  renderReceiptBlocks,
  renderReceiptSegments,
  type ReceiptBlockKind,
  type ReceiptConfig,
  type ReceiptLayout,
  type ReceiptOrder,
  type ReceiptSegment,
} from "./receipt-layout";
import { blockLabel, type DraftBlock } from "./receipt-editor";

/**
 * What the Receipt editor draws on its paper, and what "Print a sample" sends.
 *
 * Both come from the exact engine the counter prints with, fed a fixed sample
 * sale — never a real order, so the editor needs no network and shows every
 * block with something in it.
 */

/** Deterministic sample sale — mirror of the web Studio's `sample-order.ts`. */
export const SAMPLE_ORDER: ReceiptOrder = {
  _id: "sample-order-4821",
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: "Maria",
  customerContact: "09171234567",
  orderType: "Dine-in",
  // A seated sample carrying the answers a checkout collects, so the table,
  // address and checkout-answer blocks all preview with values rather than
  // silence — a merchant arranging a block that prints nothing cannot tell an
  // empty sample from a broken layout.
  customerData: {
    table_number: "12",
    delivery_address: "24 Rizal Street, Barangay San Jose, Quezon City",
    landmark: "Beside the blue gate",
    email: "maria@example.com",
  },
  // Both fees on purpose: the merchant arranging totals has to SEE where a
  // service charge and a delivery fee land before a live chit shows them.
  serviceCharge: 37.25,
  deliveryFee: 50,
  total: 459.75,
  paymentMethod: "Cash",
  cashTendered: 500,
  changeDue: 40.25,
  items: [
    { menuItemName: "Iced Latte", quantity: 2, subtotal: 240, variation: "Large" },
    { menuItemName: "Ham & Cheese Croissant", quantity: 1, subtotal: 132.5 },
  ],
};

/** Stands in for the signed tracking link the printer mints per order. */
export const SAMPLE_TRACKING_URL = "https://webnegosyo.com/order/sample?t=0000000000";

export interface PreviewConfig {
  storeName: string;
  logoUrl: string | null;
  /** Text columns of the paper being previewed — 32 on 58mm, 48 on 80mm. */
  columns: number;
}

export interface PreviewBlock {
  id: string;
  kind: ReceiptBlockKind;
  label: string;
  segments: ReceiptSegment[];
  /** Shown in place of the block when it prints nothing on the sample. */
  emptyHint: string | null;
}

function receiptConfig(config: PreviewConfig): ReceiptConfig {
  return {
    storeName: config.storeName,
    width: config.columns,
    trackingUrl: SAMPLE_TRACKING_URL,
    ...(config.logoUrl ? { logoUrl: config.logoUrl } : {}),
  };
}

function emptyHint(kind: ReceiptBlockKind, hasLogo: boolean): string {
  if (kind === "logo") return hasLogo ? "Prints your logo" : "No logo uploaded yet";
  if (kind === "storeAddress") return "Prints only when an address is set";
  return "Nothing to print on this sample sale";
}

/**
 * One entry per block, in stack order, carrying that block's share of the
 * paper. The paper maps taps back to blocks through these ids.
 */
export function buildPreviewBlocks(
  drafts: DraftBlock[],
  layout: ReceiptLayout,
  config: PreviewConfig,
): PreviewBlock[] {
  if (drafts.length === 0) return [];
  const rendered = renderReceiptBlocks(SAMPLE_ORDER, receiptConfig(config), layout);
  return drafts.map((draft, index) => {
    const segments = rendered[index]?.segments ?? [];
    return {
      id: draft.id,
      kind: draft.block.kind,
      label: blockLabel(draft.block.kind),
      segments,
      emptyHint: segments.length === 0 ? emptyHint(draft.block.kind, config.logoUrl !== null) : null,
    };
  });
}

/** The draft as the printer receives it, on the sample sale. */
export function sampleReceiptSegments(layout: ReceiptLayout, config: PreviewConfig): ReceiptSegment[] {
  if (layout.blocks.length === 0) return [];
  return renderReceiptSegments(SAMPLE_ORDER, receiptConfig(config), layout);
}

/**
 * Advance width of one monospace character, as a share of the font size.
 * Menlo (iOS) and Droid Sans Mono (Android) both sit at 0.6em.
 */
export const MONO_CHAR_RATIO = 0.6;

/**
 * Never render the paper smaller than this. Low on purpose: the template
 * thumbnails are a whole receipt at a glance, legible as shape, not as text.
 */
const MIN_PAPER_FONT = 3;

/** The font size that fits exactly `columns` characters into `innerWidth` points. */
export function paperFontSize(innerWidth: number, columns: number): number {
  if (innerWidth <= 0 || columns <= 0) return MIN_PAPER_FONT;
  const fitted = innerWidth / columns / MONO_CHAR_RATIO;
  return Math.max(MIN_PAPER_FONT, Math.floor(fitted * 10) / 10);
}

/**
 * A few characters of what each block prints — the block library shows these
 * in the receipt's own typeface instead of a generic icon, so a merchant picks
 * a block by recognising the line they want on their paper.
 */
export const BLOCK_SAMPLES: Record<ReceiptBlockKind, string> = {
  logo: "[ logo ]",
  businessName: "YOUR STORE",
  storeAddress: "24 Rizal St.",
  text: "Thank you!",
  divider: "════════",
  orderMeta: "#4821 · 12:30",
  orderNumber: "Order #4821",
  orderDate: "Jul 26 12:30",
  customerName: "Maria",
  orderType: "Dine-in",
  tableNumber: "Table 12",
  contact: "0917 123 4567",
  deliveryAddress: "24 Rizal St.",
  customerDetails: "Landmark: …",
  fillIn: "Name: _____",
  items: "2x Latte  240",
  itemsSummary: "Items: 3",
  totals: "TOTAL 459.75",
  qr: "▚▞ scan",
  feed: "↵",
};

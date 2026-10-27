/**
 * The demo store's shift (no account, read-only): a believable Day shift so
 * an App Store reviewer or a prospect sees the screen filled, labelled
 * "Sample shift". Built relative to now so it always reads as today. Pure.
 */

import type { ShiftReceiptStatus, ShiftSalesReceipt, ShiftSalesReport } from "./shift-sales";

const MINUTE_MS = 60_000;
const SHIFT_LENGTH_MS = 6 * 60 * MINUTE_MS;

const SAMPLE_RECEIPTS: readonly [number, string, string, number, ShiftReceiptStatus][] = [
  // [minutes after open, type, method, centavos, status]
  [8, "Dine-in", "Cash", 38_500, "paid"],
  [21, "Pickup", "GCash", 52_000, "paid"],
  [47, "Dine-in", "Cash", 24_000, "paid"],
  [66, "Delivery", "GCash", 61_500, "paid"],
  [93, "Dine-in", "Card", 88_000, "paid"],
  [118, "Dine-in", "Cash", 31_000, "void"],
  [140, "Pickup", "Cash", 19_500, "paid"],
  [171, "Dine-in", "Maya", 45_000, "paid"],
  [204, "Dine-in", "Cash", 72_000, "unpaid"],
  [236, "Pickup", "GCash", 27_500, "paid"],
];

function sampleReceipts(openedMs: number): ShiftSalesReceipt[] {
  return SAMPLE_RECEIPTS.map(([minutes, type, method, cents, status], index) => ({
    orderId: `demo-shift-${index + 1}`,
    number: `#${String(index + 1).padStart(2, "0")}`,
    placedAt: new Date(openedMs + minutes * MINUTE_MS).toISOString(),
    orderTypeLabel: type,
    methodLabel: method,
    totalCents: cents,
    status,
  }));
}

export function sampleShiftSales(nowMs: number): ShiftSalesReport {
  const openedMs = nowMs - SHIFT_LENGTH_MS;
  const openedAt = new Date(openedMs).toISOString();
  return {
    source: "sample",
    hidden: false,
    window: { from: openedAt, to: new Date(nowMs).toISOString() },
    shift: {
      id: "demo-shift",
      staffName: "Ana",
      drawerName: "Cashier 1",
      openedAt,
      closedAt: null,
      businessDay: null,
      servicePeriodName: "Day shift",
    },
    summary: {
      orders: 9,
      grossCents: 434_000,
      discountCents: 6_000,
      netCents: 428_000,
      serviceChargeCents: 0,
      deliveryCents: 0,
      collectedCents: 356_000,
      unpaidCents: 72_000,
      overpaidCents: 0,
      voidCount: 1,
      voidCents: 31_000,
      refundCents: 0,
    },
    payments: [
      { key: "cash", label: "Cash", cents: 81_000, count: 4 },
      { key: "gcash", label: "GCash", cents: 141_000, count: 3 },
      { key: "card", label: "Card", cents: 88_000, count: 1 },
      { key: "maya", label: "Maya", cents: 45_000, count: 1 },
    ].sort((a, b) => b.cents - a.cents),
    orderTypes: [
      { key: "dine_in", label: "Dine-in", orders: 5, netCents: 257_000 },
      { key: "pickup", label: "Pickup", orders: 3, netCents: 99_000 },
      { key: "delivery", label: "Delivery", orders: 1, netCents: 61_500 },
    ],
    channels: [
      { key: "pos", label: "Counter", orders: 7, netCents: 300_500 },
      { key: "web", label: "Online", orders: 2, netCents: 117_000 },
    ],
    items: [
      { label: "Iced Spanish Latte", quantity: 14, netCents: 196_000 },
      { label: "Chicken Pesto Sandwich", quantity: 6, netCents: 114_000 },
      { label: "Ube Cheese Pandesal", quantity: 12, netCents: 66_000 },
      { label: "Americano", quantity: 5, netCents: 52_000 },
    ],
    receipts: sampleReceipts(openedMs),
    receiptsTruncated: false,
    firstNumber: "#01",
    lastNumber: "#10",
  };
}

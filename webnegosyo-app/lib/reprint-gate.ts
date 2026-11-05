/**
 * When the order screen offers "Reprint receipt" and "Print kitchen chit".
 *
 * The Reprint button used to sit inside the order's status actions, which are
 * gone once an order is delivered — so every finished sale, the one a customer
 * comes back to ask about, had no way to print its receipt again. It was also
 * hidden without a word on a device with no receipt printer. Now the receipt
 * is offered on every order that was sold (anything past pending, short of
 * cancelled), and a device that cannot print says so instead of hiding it.
 */

import { printersForRole, type RegisteredPrinter } from "./printer-registry";

export const NO_RECEIPT_PRINTER_REASON = "No receipt printer on this device";

/** The few facts the gates read; offline-queued orders carry `offlineSync`. */
export interface ReprintGateOrder {
  status: string;
  offlineSync?: string;
}

export interface ReprintGate {
  /** Draw the control at all. */
  show: boolean;
  /** A tap can print (a receipt printer is saved on this device). */
  enabled: boolean;
  /** Why it cannot print, for the line under a disabled control. */
  reason: string | null;
}

const HIDDEN: ReprintGate = { show: false, enabled: false, reason: null };

/** Statuses with no sale behind them: nothing to reprint. */
const NOT_SOLD: ReadonlySet<string> = new Set(["pending", "cancelled"]);

export function reprintGate(
  order: ReprintGateOrder | null | undefined,
  printers: readonly RegisteredPrinter[],
): ReprintGate {
  if (!order || NOT_SOLD.has(order.status)) return HIDDEN;
  const hasReceiptPrinter = reprintTargets(printers).length > 0;
  return hasReceiptPrinter
    ? { show: true, enabled: true, reason: null }
    : { show: true, enabled: false, reason: NO_RECEIPT_PRINTER_REASON };
}

/** The kitchen chit is offered only where a kitchen printer is saved. */
export function kitchenChitGate(
  order: ReprintGateOrder | null | undefined,
  printers: readonly RegisteredPrinter[],
): boolean {
  if (!order || order.status === "cancelled") return false;
  return printersForRole(printers, "kitchen").length > 0;
}

/** The printers a receipt can be reprinted on. */
export function reprintTargets(printers: readonly RegisteredPrinter[]): RegisteredPrinter[] {
  return printersForRole(printers, "cashier");
}

/** Two or more receipt printers: ask which one, rather than guess. */
export function needsPrinterPicker(printers: readonly RegisteredPrinter[]): boolean {
  return reprintTargets(printers).length >= 2;
}

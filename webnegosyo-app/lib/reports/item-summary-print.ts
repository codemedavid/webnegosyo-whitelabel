/**
 * Print and share the ITEM SUMMARY slip (lib/cash-slips/item-summary-slip.ts).
 * Printed on the first cashier-role printer at its own paper width, like the
 * shift report; shared as plain text through the phone's share sheet.
 */

import { Share } from "react-native";

import { buildItemSummarySlip, type ItemSummarySlipOptions } from "../cash-slips/item-summary-slip";
import { slipPlainText } from "../cash-slips/slip-text";
import { NO_PRINTER_MESSAGE, slipWidthFor } from "../cash/shift-sales-print";
import { printForRole } from "../printer";
import { printersForRole } from "../printer-registry";
import { usePrinterStore } from "../../stores/printer-store";
import type { ItemSummary } from "./item-summary";

export { NO_PRINTER_MESSAGE };

export type ItemSummaryPrintOutcome =
  | { ok: true }
  /** `isNoPrinter`: nothing to print on — the screen offers Printer settings. */
  | { ok: false; isNoPrinter: boolean; message: string };

export type ItemSummarySlipContext = Omit<ItemSummarySlipOptions, "width" | "printedAt">;

const SHARE_WIDTH = 32;

export async function printItemSummary(summary: ItemSummary, context: ItemSummarySlipContext): Promise<ItemSummaryPrintOutcome> {
  const { printers } = usePrinterStore.getState();
  if (printersForRole(printers, "cashier").length === 0) {
    return { ok: false, isNoPrinter: true, message: NO_PRINTER_MESSAGE };
  }
  const segments = buildItemSummarySlip(summary, { ...context, width: slipWidthFor(printers), printedAt: new Date() });
  const outcome = await printForRole("cashier", segments);
  if (outcome.anySuccess) return { ok: true };
  return { ok: false, isNoPrinter: false, message: outcome.results[0]?.result.error ?? "Could not reach the receipt printer." };
}

/** The same slip as text, for Messenger, Viber or SMS. Never throws. */
export async function shareItemSummary(summary: ItemSummary, context: ItemSummarySlipContext): Promise<void> {
  const text = slipPlainText(buildItemSummarySlip(summary, { ...context, width: SHARE_WIDTH, printedAt: new Date() }));
  try {
    await Share.share({ message: text });
  } catch (error) {
    console.warn("[item-summary] share failed", error);
  }
}

/**
 * Print and share the SHIFT REPORT slip (lib/cash-slips/shift-report.ts,
 * owned by the shared slips). Printed on the first cashier-role printer at
 * its own paper width; shared as plain text through the phone's share sheet
 * (the app's only share mechanism today — no image capture module ships).
 */

import { Share } from "react-native";

import { buildShiftReportSlip } from "../cash-slips/shift-report";
import { slipPlainText, type SlipWidth } from "../cash-slips/slip-text";
import { printForRole } from "../printer";
import { printersForRole, type RegisteredPrinter } from "../printer-registry";
import { charsForPaperWidth } from "../receipt-escpos";
import { usePrinterStore } from "../../stores/printer-store";
import type { ShiftSalesReport } from "./shift-sales";

export type PrintOutcome = { ok: true } | { ok: false; message: string };

export const NO_PRINTER_MESSAGE = "No receipt printer is set up on this tablet. Add one in Printer settings.";

/** 32 characters on 58 mm paper, 48 on 80 mm; 32 when no printer says. */
export function slipWidthFor(printers: readonly RegisteredPrinter[]): SlipWidth {
  const [cashier] = printersForRole(printers, "cashier");
  return cashier?.paperWidth ? (charsForPaperWidth(cashier.paperWidth) as SlipWidth) : 32;
}

export async function printShiftReport(report: ShiftSalesReport, storeName: string, branchName?: string): Promise<PrintOutcome> {
  const { printers } = usePrinterStore.getState();
  if (printersForRole(printers, "cashier").length === 0) return { ok: false, message: NO_PRINTER_MESSAGE };
  const segments = buildShiftReportSlip(report, { storeName, branchName, width: slipWidthFor(printers), printedAt: new Date() });
  const outcome = await printForRole("cashier", segments);
  if (outcome.anySuccess) return { ok: true };
  return { ok: false, message: outcome.results[0]?.result.error ?? "Could not reach the receipt printer." };
}

/** The same slip as text, for Messenger, Viber or SMS. Never throws. */
export async function shareShiftReport(report: ShiftSalesReport, storeName: string, branchName?: string): Promise<void> {
  const text = slipPlainText(buildShiftReportSlip(report, { storeName, branchName, width: 32, printedAt: new Date() }));
  try {
    await Share.share({ message: text });
  } catch (error) {
    console.warn("[shift-sales] share failed", error);
  }
}

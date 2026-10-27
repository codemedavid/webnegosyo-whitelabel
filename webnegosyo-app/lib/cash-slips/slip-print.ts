/**
 * Print and share the remittance slip and the day close — the same path as
 * the SHIFT REPORT (lib/cash/shift-sales-print.ts, whose width rule and
 * outcome type are reused here, not copied): the first cashier-role printer at
 * its own paper width; shared as plain text through the phone's share sheet.
 */

import { Share } from "react-native";

import { usePrinterStore } from "../../stores/printer-store";
import { NO_PRINTER_MESSAGE, slipWidthFor, type PrintOutcome } from "../cash/shift-sales-print";
import { printForRole, type PrintSegment } from "../printer";
import { printersForRole } from "../printer-registry";
import { buildDayCloseSlip, type DayCloseSlipInput } from "./day-close";
import { buildRemittanceSlip, type RemittanceSlipInput } from "./remittance-slip";
import { slipPlainText, type SlipWidth } from "./slip-text";

export type { PrintOutcome };

/** Who the slip is for, printed at its head. */
export interface SlipStore {
  storeName: string;
  branchName?: string;
}

type SlipBuilder = (width: SlipWidth, printedAt: Date) => PrintSegment[];

/** Shared slips are read on a phone: the narrow paper wraps best there. */
const SHARE_WIDTH: SlipWidth = 32;

async function printSlip(build: SlipBuilder): Promise<PrintOutcome> {
  const { printers } = usePrinterStore.getState();
  if (printersForRole(printers, "cashier").length === 0) return { ok: false, message: NO_PRINTER_MESSAGE };
  const outcome = await printForRole("cashier", build(slipWidthFor(printers), new Date()));
  if (outcome.anySuccess) return { ok: true };
  return { ok: false, message: outcome.results[0]?.result.error ?? "Could not reach the receipt printer." };
}

async function shareSlip(build: SlipBuilder, label: string): Promise<void> {
  try {
    await Share.share({ message: slipPlainText(build(SHARE_WIDTH, new Date())) });
  } catch (error) {
    // The share sheet was dismissed or is unavailable; nothing to undo.
    console.warn(`[cash-slips] ${label} share failed`, error);
  }
}

export function printRemittanceSlip(input: RemittanceSlipInput, store: SlipStore): Promise<PrintOutcome> {
  return printSlip((width, printedAt) => buildRemittanceSlip(input, { ...store, width, printedAt }));
}

export function shareRemittanceSlip(input: RemittanceSlipInput, store: SlipStore): Promise<void> {
  return shareSlip((width, printedAt) => buildRemittanceSlip(input, { ...store, width, printedAt }), "remittance");
}

export function printDayCloseSlip(input: DayCloseSlipInput, store: SlipStore): Promise<PrintOutcome> {
  return printSlip((width, printedAt) => buildDayCloseSlip(input, { ...store, width, printedAt }));
}

export function shareDayCloseSlip(input: DayCloseSlipInput, store: SlipStore): Promise<void> {
  return shareSlip((width, printedAt) => buildDayCloseSlip(input, { ...store, width, printedAt }), "day close");
}

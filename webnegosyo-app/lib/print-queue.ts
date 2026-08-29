// Print-job planning. The native thermal-printer lib holds ONE active
// connection per transport — connectPrinter just switches the target — and
// printBill is fire-and-forget (its promise resolves on a 1.5s timer, not a
// completion callback). The planner turns a queue of jobs into ordered steps
// that respect both facts: connect only when the target actually changes, and
// pause before switching away from a live connection so the previous job's
// bytes finish draining first. Execution (natives, retries) lives in
// lib/printer.ts.

import type { RegisteredPrinter, PrinterRole } from "./printer-registry";
import { printersForRole } from "./printer-registry";
import type { PrintSegment } from "./printer";

/**
 * Drain window before the connection moves to a different printer. printBill
 * resolves optimistically after 1.5s; a target switch racing the tail of that
 * transfer garbles the paper on both printers.
 */
export const SWITCH_SETTLE_MS = 500;

export interface PrintJob {
  targetId: string;
  segments: PrintSegment[];
}

export interface JobPlanStep {
  printer: RegisteredPrinter;
  needsConnect: boolean;
  settleBeforeConnectMs: number;
  segments: PrintSegment[];
}

/**
 * Plan a queue of jobs against the currently connected address. Jobs whose
 * target printer has been removed are dropped — printing to a ghost printer
 * has no meaningful fallback.
 */
export function planPrintJobs(
  jobs: readonly PrintJob[],
  printers: readonly RegisteredPrinter[],
  currentAddress: string | null,
): JobPlanStep[] {
  const byId = new Map(printers.map((p) => [p.id, p]));
  const steps: JobPlanStep[] = [];
  let connected = currentAddress;

  for (const job of jobs) {
    const printer = byId.get(job.targetId);
    if (!printer) continue;

    const needsConnect = connected !== printer.address;
    steps.push({
      printer,
      needsConnect,
      // Only a live connection to a DIFFERENT printer needs the drain pause.
      settleBeforeConnectMs: needsConnect && connected !== null ? SWITCH_SETTLE_MS : 0,
      segments: job.segments,
    });
    connected = printer.address;
  }

  return steps;
}

/**
 * Fan a logical print out into jobs. Kitchen chits go to EVERY kitchen-role
 * printer (hot line + expo is the restaurant norm); the customer receipt goes
 * to the first cashier-role printer only — one customer, one receipt.
 */
export function jobsForRole(
  printers: readonly RegisteredPrinter[],
  role: PrinterRole,
  segments: PrintSegment[],
): PrintJob[] {
  const holders = printersForRole(printers, role);
  const targets = role === "cashier" ? holders.slice(0, 1) : holders;
  return targets.map((p) => ({ targetId: p.id, segments }));
}

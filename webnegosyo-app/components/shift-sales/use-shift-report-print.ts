import { useCallback, useState } from "react";

import { useAuthStore } from "../../stores/auth-store";
import { usePrinterStore } from "../../stores/printer-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { printersForRole } from "../../lib/printer-registry";
import type { PrintState } from "../../lib/cash/shift-report-actions";
import type { ShiftSalesReport } from "../../lib/cash/shift-sales";
import { NO_PRINTER_MESSAGE, printShiftReport, shareShiftReport } from "../../lib/cash/shift-sales-print";

export interface ShiftReportPrinter {
  state: PrintState;
  /** False when no cashier printer is set up on this tablet (the button then says so). */
  hasPrinter: boolean;
  noPrinterMessage: string;
  print: (report: ShiftSalesReport) => Promise<void>;
  share: (report: ShiftSalesReport) => Promise<void>;
  /** Back to idle (a screen that stays mounted, on its next visit). */
  reset: () => void;
}

/** Print / share one shift report with a visible printing → printed / failed state. */
export function useShiftReportPrint(): ShiftReportPrinter {
  const isDemo = useAuthStore((s) => s.isDemo);
  const storeName = useAuthStore((s) => s.tenantName) ?? "Store";
  const branchName = useAuthStore((s) => s.outletName) ?? undefined;
  const hasPrinter = usePrinterStore((s) => printersForRole(s.printers, "cashier").length > 0);
  const [state, setState] = useState<PrintState>({ status: "idle" });

  const print = useCallback(
    async (report: ShiftSalesReport) => {
      if (isDemo) {
        setState({ status: "failed", message: DEMO_READONLY_MESSAGE });
        return;
      }
      setState({ status: "printing" });
      try {
        const outcome = await printShiftReport(report, storeName, branchName);
        setState(outcome.ok ? { status: "printed" } : { status: "failed", message: outcome.message });
      } catch (error) {
        setState({ status: "failed", message: error instanceof Error ? error.message : "Could not reach the receipt printer." });
      }
    },
    [isDemo, storeName, branchName],
  );

  const share = useCallback((report: ShiftSalesReport) => shareShiftReport(report, storeName, branchName), [storeName, branchName]);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, hasPrinter, noPrinterMessage: NO_PRINTER_MESSAGE, print, share, reset };
}

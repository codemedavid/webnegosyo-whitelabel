import { useEffect, useRef } from "react";
import { useAuthStore } from "../stores/auth-store";
import { usePrinterStore } from "../stores/printer-store";
import { isPrinterSupported, pickWarmUpTarget, warmUpPrinter } from "../lib/printer";

/**
 * A breath after the printer list loads, so the warm-up never competes with
 * the app's own launch work for the Bluetooth radio.
 */
const WARM_UP_DELAY_MS = 1_500;

/**
 * Opens the connection to the cashier printer at launch, so the first
 * receipt of the day does not pay the Bluetooth handshake (and, on iOS, a
 * rescan) between the tap and the paper. Mounted once in the (main) layout.
 * Renders nothing. Re-warms only when the target printer changes — a
 * connection dropped mid-shift is recovered by the print path's own retry.
 */
export function PrinterWarmUp() {
  const printers = usePrinterStore((s) => s.printers);
  const isDemo = useAuthStore((s) => s.isDemo);
  const target = pickWarmUpTarget(printers);
  const targetAddress = target?.address ?? null;
  const warmedAddressRef = useRef<string | null>(null);

  useEffect(() => {
    if (!target || targetAddress === null || isDemo || !isPrinterSupported()) return;
    if (warmedAddressRef.current === targetAddress) return;
    warmedAddressRef.current = targetAddress;

    const timer = setTimeout(() => {
      void warmUpPrinter(target);
    }, WARM_UP_DELAY_MS);
    return () => clearTimeout(timer);
    // `target` is derived from the address; the address is the identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAddress, isDemo]);

  return null;
}

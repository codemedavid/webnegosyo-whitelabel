/**
 * How long the order screen's Drawer "Reprint" waits for the payments ledger
 * before printing without it. Offline the ledger read may never answer; the
 * copy then prints the no-ledger receipt (paid orders still say paid, an
 * unpaid one prints no Paid / Balance lines) rather than never printing.
 */

import { useEffect, useState } from "react";

export const REPRINT_LEDGER_WAIT_MS = 5000;

/** True once `isWaiting` has held for REPRINT_LEDGER_WAIT_MS; false again when it stops. */
export function useReprintLedgerWait(isWaiting: boolean): boolean {
  const [hasExpired, setHasExpired] = useState(false);

  useEffect(() => {
    if (!isWaiting) {
      setHasExpired(false);
      return;
    }
    const timer = setTimeout(() => setHasExpired(true), REPRINT_LEDGER_WAIT_MS);
    return () => clearTimeout(timer);
  }, [isWaiting]);

  return isWaiting && hasExpired;
}

import { useEffect } from "react";

import { getConnectivity, subscribeConnectivity } from "../../lib/offline/connectivity";
import { flushExpenses, pendingExpenses, pendingReceipts } from "../../lib/expenses/live-expense-queue";
import { useExpenseTenant, useInvalidateExpenses } from "../../lib/expenses/use-expenses";

/** While something waits, try again this often (the queue's own backoff decides what is due). */
const WAITING_POLL_MS = 60_000;

/**
 * Sends the expenses this phone kept while offline, from any tab.
 *
 * Renders nothing. Mounted once in the (main) layout beside the sales sync:
 * flushes on mount, the moment the connection comes back, and once a minute
 * while any expense or receipt photo is waiting. A pass that landed something refreshes every
 * expense screen.
 */
export function ExpenseSync() {
  const tenantId = useExpenseTenant();
  const invalidate = useInvalidateExpenses();

  useEffect(() => {
    if (!tenantId) return;
    let isActive = true;

    const run = async () => {
      const result = await flushExpenses(tenantId);
      if (isActive && result.sent.size > 0) await invalidate();
    };

    void run();
    let lastStatus = getConnectivity().status;
    const unsubscribe = subscribeConnectivity(() => {
      const status = getConnectivity().status;
      if (status === "online" && lastStatus !== "online") void run();
      lastStatus = status;
    });
    // Receipts count too: a photo backing off after a failed send would
    // otherwise retry only on app start or when the connection comes back.
    const timer = setInterval(() => {
      void Promise.all([pendingExpenses(tenantId), pendingReceipts(tenantId)]).then(([expenses, receipts]) => {
        const isWaiting = [...expenses, ...receipts].some((entry) => !entry.refusedReason);
        if (isActive && isWaiting) void run();
      });
    }, WAITING_POLL_MS);

    return () => {
      isActive = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, [tenantId, invalidate]);

  return null;
}

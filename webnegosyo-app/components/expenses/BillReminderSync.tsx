import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { useAuthStore } from "../../stores/auth-store";
import { reminderOwner, subscribeBillReminderResync } from "../../lib/expenses/bill-alerts";
import { clearBillRemindersOnDevice, syncBillRemindersOnDevice } from "../../lib/expenses/bill-alerts-device";
import { forgetBills, rememberBills } from "../../lib/expenses/bill-ways-in";
import { useBillBoard } from "../../lib/expenses/use-bills";
import { useCanManageExpenses } from "../../lib/expenses/use-expenses";
import { shouldRefetchOnFocus } from "../../lib/query/use-screen-focus";

/** Coming back to the app re-reads the board when it is older than this. */
const FOCUS_STALE_MS = 30_000;

/**
 * Keeps this phone's bill reminders (lib/expenses/bill-alerts.ts) equal to
 * the bills, for the signed-in owner or manager. Renders nothing; mounted once
 * in the (main) layout beside `ExpenseSync`.
 *
 * Re-plans when the board changes (every expense or bill write invalidates
 * it), when the app comes back to the front (a new morning, a bill paid on
 * another phone), and when permission is newly granted. Clears every bill
 * reminder on sign-out or for an account that must not get them. Never asks
 * for permission itself. Also hands the board to the Undo bar's "Repeat"
 * (`knownBills`), so a save never starts a read to decide on a button.
 */
export function BillReminderSync() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemo = useAuthStore((s) => s.isDemo);
  const impersonatedTenantId = useAuthStore((s) => s.impersonatedTenantId);
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const canManageExpenses = useCanManageExpenses();
  const owner = reminderOwner({ isLoading, isAuthenticated, isDemo, impersonatedTenantId, tenantId, userId, canManageExpenses });
  const ownerKey = owner.kind === "owner" ? owner.key : null;

  const { data: board, dataUpdatedAt, isRefetching, refetch } = useBillBoard(undefined, ownerKey !== null);
  // Bumped by app focus and by a fresh permission grant: re-plan with the same board.
  const [pass, setPass] = useState(0);

  useEffect(() => subscribeBillReminderResync(() => setPass((value) => value + 1)), []);

  useEffect(() => {
    if (ownerKey === null) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      setPass((value) => value + 1);
      if (!isRefetching && shouldRefetchOnFocus({ dataUpdatedAt, staleMs: FOCUS_STALE_MS, nowMs: Date.now() })) void refetch();
    });
    return () => subscription.remove();
  }, [ownerKey, dataUpdatedAt, isRefetching, refetch]);

  useEffect(() => {
    if (owner.kind === "wait") return;
    if (ownerKey === null) {
      forgetBills();
      void clearBillRemindersOnDevice();
      return;
    }
    // No board yet (loading, or offline with nothing read): keep what the phone holds.
    if (!board || !tenantId) return;
    rememberBills(tenantId, board.bills);
    void syncBillRemindersOnDevice(ownerKey, board);
  }, [owner.kind, ownerKey, tenantId, board, pass]);

  return null;
}

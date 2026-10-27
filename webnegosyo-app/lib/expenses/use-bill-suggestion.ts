/**
 * "Make it a bill?" for the Expenses screen's Needs you card
 * (bill-ways-in.ts `pickBillSuggestion`, engine `suggestBills`).
 *
 * Reads the 3 full months before this one on the SAME cache entries as the
 * Expenses screen (`useExpenseMonth`): last month is already read for the
 * change pill, so the cost is two more bounded month reads, only for an
 * account that manages expenses and only while the screen asks. "Not now"
 * is remembered per store and category for 30 days on this phone.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  activeDismissals,
  lastFullMonths,
  pickBillSuggestion,
  withDismissal,
  type BillSuggestionView,
  type SuggestionDismissals,
} from "./bill-ways-in";
import { manilaToday, monthLabel } from "./expense-format";
import { useBillBoard } from "./use-bills";
import { useExpenseCategories, useExpenseMonth, useExpenseTenant } from "./use-expenses";

const STORAGE_PREFIX = "expenses.billSuggestion.notNow.";

export interface BillSuggestionState {
  suggestion: BillSuggestionView | null;
  /** "Not now": hides this category's suggestion for 30 days on this phone. */
  dismiss: (categoryId: string) => void;
}

function useDismissals(tenantId: string | null): [SuggestionDismissals, (categoryId: string) => void] {
  const [dismissed, setDismissed] = useState<SuggestionDismissals>({});

  useEffect(() => {
    setDismissed({});
    if (!tenantId) return;
    let isActive = true;
    AsyncStorage.getItem(`${STORAGE_PREFIX}${tenantId}`)
      .then((raw) => {
        if (isActive) setDismissed(activeDismissals(raw ? JSON.parse(raw) : null, Date.now()));
      })
      // Unreadable = nothing put off: the worst case is asking once more.
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, [tenantId]);

  const dismiss = useCallback(
    (categoryId: string) => {
      if (!tenantId) return;
      setDismissed((current) => {
        const next = withDismissal(current, categoryId, Date.now());
        AsyncStorage.setItem(`${STORAGE_PREFIX}${tenantId}`, JSON.stringify(next)).catch(() => undefined);
        return next;
      });
    },
    [tenantId],
  );

  return [dismissed, dismiss];
}

/**
 * The one suggestion to show (null while anything is still loading, or none
 * fits). `outletId` follows the Expenses screen's branch so its month reads
 * are shared; `isEnabled` = the account manages expenses.
 */
export function useBillSuggestion(isEnabled: boolean, outletId: string | undefined): BillSuggestionState {
  const tenantId = useExpenseTenant();
  const today = manilaToday();
  const [oldest, middle, newest] = lastFullMonths(today);
  const first = useExpenseMonth(oldest, outletId, isEnabled);
  const second = useExpenseMonth(middle, outletId, isEnabled);
  const third = useExpenseMonth(newest, outletId, isEnabled);
  const { categories } = useExpenseCategories();
  const board = useBillBoard(undefined, isEnabled);
  const [dismissed, dismiss] = useDismissals(isEnabled ? tenantId : null);

  const suggestion = useMemo(() => {
    const months = [first.data, second.data, third.data];
    if (!isEnabled || !board.data || months.some((month) => month === undefined)) return null;
    const nowMs = Date.now();
    return pickBillSuggestion({
      expenses: months.flatMap((month) => month?.expenses ?? []),
      categories,
      bills: board.data.bills,
      today,
      dismissed,
      nowMs,
      monthName: (month) => monthLabel(month, nowMs),
    });
  }, [isEnabled, first.data, second.data, third.data, categories, board.data, today, dismissed]);

  return { suggestion, dismiss };
}

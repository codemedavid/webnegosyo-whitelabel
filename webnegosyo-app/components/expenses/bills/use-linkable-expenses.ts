import { useMemo } from "react";

import type { Bill } from "../../../lib/expenses/bill-schedule";
import { linkCandidates, linkWindowMonths } from "../../../lib/expenses/bills-screen";
import { useExpenseMonth } from "../../../lib/expenses/use-expenses";
import type { Expense } from "../../../lib/expenses/types";

const NO_EXPENSES: Expense[] = [];

export interface LinkableExpenses {
  expenses: Expense[];
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * "I already recorded it": the recorded expenses of the bill's category within
 * 10 days of the due date, read from the month(s) that window touches — the
 * same cached month reads the expense book uses. Reads nothing until enabled.
 */
export function useLinkableExpenses(bill: Pick<Bill, "categoryId">, dueOn: string, enabled: boolean): LinkableExpenses {
  const [first, second] = linkWindowMonths(dueOn);
  const firstMonth = useExpenseMonth(first, undefined, enabled);
  const secondMonth = useExpenseMonth(second ?? first, undefined, enabled && second !== undefined);
  const firstRows = firstMonth.data?.expenses ?? NO_EXPENSES;
  const secondRows = second === undefined ? NO_EXPENSES : (secondMonth.data?.expenses ?? NO_EXPENSES);
  const { categoryId } = bill;
  const expenses = useMemo(
    () => linkCandidates([...firstRows, ...secondRows], { categoryId }, dueOn),
    [firstRows, secondRows, categoryId, dueOn],
  );
  const reads = second === undefined ? [firstMonth] : [firstMonth, secondMonth];
  return {
    expenses,
    isLoading: enabled && reads.some((read) => read.isLoading && read.data === undefined),
    error: reads.map((read) => read.error).find((error) => error !== null) ?? null,
    retry: () => {
      for (const read of reads) void read.refetch();
    },
  };
}

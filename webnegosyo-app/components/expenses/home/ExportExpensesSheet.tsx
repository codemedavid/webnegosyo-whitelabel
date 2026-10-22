import React, { useMemo, useState } from "react";

import type { DayRange } from "../../../lib/expenses/expenses-home";
import { buildExpenseCsv } from "../../../lib/expenses/expenses-home-csv";
import type { Expense, ExpenseCategory } from "../../../lib/expenses/types";
import { shareCsv } from "../../../lib/export/share";
import { ExportSheet } from "../../ExportSheet";

interface ExportExpensesSheetProps {
  /** "October", "20–26 Oct". */
  label: string;
  expenses: readonly Expense[];
  categories: readonly ExpenseCategory[];
  window: DayRange;
  isTruncated: boolean;
  /** The window has not come back yet: never say "No expenses" for a month still loading. */
  isLoading: boolean;
  /** The window failed to load: there is nothing true to export. */
  hasFailed: boolean;
  onClose: () => void;
}

const FAILED_MESSAGE = "The file could not be shared. Try again.";

/**
 * The window's book as a spreadsheet (date, category, note, paid to, paid
 * from, amount, recorded by, status, receipts) through the shared export
 * sheet and share call. The whole window, whatever the filters show.
 */
export function ExportExpensesSheet({ label, expenses, categories, window, isTruncated, isLoading, hasFailed, onClose }: ExportExpensesSheetProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const built = useMemo(() => buildExpenseCsv(expenses, categories, window), [expenses, categories, window]);

  const exportNow = async () => {
    if (isLoading) {
      setError(`Still loading ${label}. Try again in a moment.`);
      return;
    }
    if (hasFailed) {
      setError(`${label} did not load. Close this, pull down to try again, then export.`);
      return;
    }
    if (built.count === 0) {
      setError(`No expenses to export for ${label}.`);
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await shareCsv({ fileName: built.fileName, csv: built.csv });
      onClose();
    } catch (failure: unknown) {
      setError(failure instanceof Error && failure.message ? failure.message : FAILED_MESSAGE);
    } finally {
      setIsBusy(false);
    }
  };

  const coverage = isLoading
    ? `Loading ${label}…`
    : hasFailed
      ? `${label} did not load.`
      : isTruncated
        ? `Only the first ${built.count} rows fit on the phone. Export from the web for the whole book.`
        : `${built.count} ${built.count === 1 ? "expense" : "expenses"}, voided ones marked.`;

  return (
    <ExportSheet
      visible
      title={`Export ${label}`}
      isBusy={isBusy}
      coverageNote={coverage}
      errorMessage={error}
      showPresets={false}
      onExport={() => void exportNow()}
      onClose={onClose}
    />
  );
}

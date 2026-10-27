import React from "react";

import { usePayableDrawers } from "../../lib/expenses/use-payable-drawers";
import { AddExpenseSheet } from "./AddExpenseSheet";

interface NewExpenseSheetProps {
  onClose: () => void;
  onCommitted?: () => void;
  initialCategoryId?: string | null;
}

/**
 * "+ Expense": the book sheet, plus "Cashier drawer" when there is an open
 * drawer this person may take from. Mount it only while open — it reads the
 * drawers when it mounts.
 */
export function NewExpenseSheet({ onClose, onCommitted, initialCategoryId = null }: NewExpenseSheetProps) {
  const drawers = usePayableDrawers();
  return (
    <AddExpenseSheet
      visible
      mode={{ kind: "book" }}
      drawers={drawers}
      initialCategoryId={initialCategoryId}
      onClose={onClose}
      onCommitted={onCommitted}
    />
  );
}

import { useRef, useState } from "react";
import { Alert } from "react-native";

import { useAuthStore } from "../../stores/auth-store";
import { expenseUndoStore, UNDO_WINDOW_MS } from "../../stores/expense-undo-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { isOffline } from "../../lib/offline/connectivity";
import { newLocalOrderId } from "../../lib/offline/local-id";
import { readActorName } from "../../lib/expenses/actor-name";
import {
  checkForm,
  savedMessage,
  savesToPhoneOnly,
  toBookDraft,
  toDrawerDraft,
  type AddExpenseForm,
  type AddExpenseMode,
  type FormVerdict,
} from "../../lib/expenses/add-expense-form";
import { manilaToday } from "../../lib/expenses/expense-format";
import type { QueuedExpensePayload } from "../../lib/expenses/expense-queue";
import { keypadCents } from "../../lib/expenses/keypad";
import {
  commitQueuedExpense,
  pendingExpenses,
  queueExpense,
  queueReceipt,
  undoExpense,
} from "../../lib/expenses/live-expense-queue";
import type { CapturedReceipt } from "../../lib/expenses/receipt-files";
import { buildUndoEntry } from "../../lib/expenses/undo-entry";
import { useExpenseOutlet, useExpenseTenant, useInvalidateExpenses } from "../../lib/expenses/use-expenses";
import type { ExpenseCategory } from "../../lib/expenses/types";

type Refusal = Extract<FormVerdict, { ok: false }>;

export type SaveOutcome =
  | { status: "saved" }
  | { status: "skipped" }
  | { status: "invalid"; field: Refusal["field"]; reason: string }
  | { status: "failed"; reason: string };

interface SaveInput {
  form: AddExpenseForm;
  category: ExpenseCategory | null;
  receipt: CapturedReceipt | null;
}

interface ExpenseSaveOptions {
  mode: AddExpenseMode;
  tracksStock: boolean;
  onCommitted?: () => void;
}

function payloadFor(
  form: AddExpenseForm,
  input: { mode: AddExpenseMode; category: ExpenseCategory; clientRequestId: string; actorName: string; outletId: string | null; tracksStock: boolean },
): QueuedExpensePayload {
  const { mode, category, clientRequestId, actorName } = input;
  if (mode.kind === "drawer") {
    return {
      kind: "drawer",
      input: { ...toDrawerDraft(form, { clientRequestId, shiftId: mode.shiftId, category }), recordedByName: actorName },
    };
  }
  return {
    kind: "book",
    createdByName: actorName,
    draft: toBookDraft(form, { clientRequestId, outletId: input.outletId, tracksStock: input.tracksStock, category }),
  };
}

/**
 * Save for the Add-expense sheet: every entry goes through the device queue
 * with its own request id and is held for the Undo window, which the global
 * undo store then counts down — so Undo never has to void anything, a dead
 * zone never loses an entry, and a replay can never record it twice.
 */
export function useExpenseSave({ mode, tracksStock, onCommitted }: ExpenseSaveOptions) {
  const tenantId = useExpenseTenant();
  const outletId = useExpenseOutlet();
  const invalidate = useInvalidateExpenses();
  const [isSaving, setIsSaving] = useState(false);
  // State lands a render late: two taps inside one frame both saw isSaving false.
  const inFlight = useRef(false);

  const save = async ({ form, category, receipt }: SaveInput): Promise<SaveOutcome> => {
    if (inFlight.current || !tenantId) return { status: "skipped" };
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return { status: "skipped" };
    }
    const verdict = checkForm(form, { mode, category, tracksStock, today: manilaToday() });
    if (!verdict.ok) return { status: "invalid", field: verdict.field, reason: verdict.reason };
    if (!category) return { status: "invalid", field: "category", reason: "Pick what it was for." };

    inFlight.current = true;
    setIsSaving(true);
    try {
      const clientRequestId = newLocalOrderId();
      const actorName = await readActorName();
      const payload = payloadFor(form, { mode, category, clientRequestId, actorName, outletId, tracksStock });
      const kept = await queueExpense({ tenantId, payload, categoryName: category.name }, UNDO_WINDOW_MS);
      if (!kept) return { status: "failed", reason: "This phone could not keep the expense. Free up some space and try again." };
      if (receipt) {
        await queueReceipt({ tenantId, clientRequestId, expenseId: null, fileUri: receipt.fileUri, mime: receipt.mime });
      }
      const isQueued = savesToPhoneOnly(await pendingExpenses(tenantId), { isOffline: isOffline(), exceptId: clientRequestId });
      expenseUndoStore.getState().show(
        buildUndoEntry({
          id: clientRequestId,
          message: savedMessage(category.name, keypadCents(form.keypad), isQueued),
          tenantId,
          actorName,
          queue: { commit: commitQueuedExpense, undo: undoExpense },
          refresh: invalidate,
          onSettled: onCommitted,
        }),
      );
      return { status: "saved" };
    } finally {
      inFlight.current = false;
      setIsSaving(false);
    }
  };

  return { isSaving, save };
}

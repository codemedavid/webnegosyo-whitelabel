/**
 * The detail screen's writes: add a receipt, open a PDF, void, change. Same
 * calls and the same demo refusal as before the redesign; only moved out of
 * the screen so it stays a layout.
 */

import { useState } from "react";
import { Alert, Linking } from "react-native";
import { router } from "expo-router";

import { useAuthStore } from "../../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../../lib/demo";
import { readActorName } from "../../../lib/expenses/actor-name";
import { liveExpenseDb } from "../../../lib/expenses/expense-client";
import { replaceExpense, voidExpense, type ExpensePatch } from "../../../lib/expenses/expense-service";
import { fetchReceiptLink, flushExpenses, queueReceipt } from "../../../lib/expenses/live-expense-queue";
import { captureReceipt, describeCaptureOutcome } from "../../../lib/expenses/receipt-files";
import type { Expense } from "../../../lib/expenses/types";

/** True (and says so) when the session is the read-only demo. */
export function refuseInDemo(): boolean {
  if (!useAuthStore.getState().isDemo) return false;
  Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
  return true;
}

interface WriteContext {
  tenantId: string | null;
  expense: Expense | null;
  reload: () => Promise<void>;
  onWritten: () => void;
}

export function useExpenseDetailWrites({ tenantId, expense, reload, onWritten }: WriteContext) {
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null);

  const takeReceipt = async (source: "camera" | "library") => {
    if (!tenantId || !expense) return;
    const outcome = await captureReceipt(source).catch(() => null);
    if (!outcome) {
      Alert.alert("Receipt", "The photo could not be saved. Try again.");
      return;
    }
    if (outcome.status !== "captured") {
      const message = describeCaptureOutcome(outcome);
      if (message) Alert.alert("Receipt", message);
      return;
    }
    const clientRequestId = expense.clientRequestId ?? expense.id;
    await queueReceipt({ tenantId, clientRequestId, expenseId: expense.id, ...outcome.receipt });
    await flushExpenses(tenantId);
    await reload();
  };

  const addReceipt = () => {
    if (refuseInDemo() || !tenantId || !expense) return;
    Alert.alert("Add a receipt", undefined, [
      { text: "Take a photo", onPress: () => void takeReceipt("camera") },
      { text: "Choose from gallery", onPress: () => void takeReceipt("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const openPdf = async (receiptId: string) => {
    setOpeningPdfId(receiptId);
    const link = await fetchReceiptLink(receiptId);
    setOpeningPdfId(null);
    if (link.status === "error") {
      Alert.alert("Receipt", link.message);
      return;
    }
    void Linking.openURL(link.url);
  };

  const confirmVoid = async (reason: string) => {
    if (refuseInDemo() || !expense) return;
    await voidExpense(liveExpenseDb, expense.id, reason, await readActorName());
    onWritten();
    await reload();
  };

  const confirmChange = async (reason: string, patch: ExpensePatch) => {
    if (refuseInDemo() || !expense) return;
    const newId = await replaceExpense(liveExpenseDb, expense, reason, patch);
    onWritten();
    await reload();
    // The corrected row is the one to read now (same screen, new id).
    router.setParams({ expenseId: newId });
  };

  return { openingPdfId, addReceipt, openPdf, confirmVoid, confirmChange };
}

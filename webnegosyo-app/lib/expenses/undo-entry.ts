/**
 * One saved expense waiting out its Undo window, as the global undo store
 * (`stores/expense-undo-store.ts`) holds it: what the bar says, how to send
 * it, and how to take it back.
 *
 * Built by the Add-expense sheet, which knows the store, the person and the
 * screen to refresh; the store only decides WHEN (and makes sure each entry is
 * sent or undone exactly once), so the bar keeps counting after the sheet
 * closes. The queue is injected so this runs under the node suite.
 */

import type { UndoEntry, UndoResult } from "../../stores/expense-undo-store";

export interface UndoQueue {
  /** Ends the hold and sends; `sent` holds what landed this pass (`commitQueuedExpense`). */
  commit(tenantId: string, requestId: string): Promise<{ sent: ReadonlyMap<string, string> }>;
  /** Forgets it inside the hold, or voids it if it already landed (`undoExpense`). */
  undo(input: { tenantId: string; requestId: string; actorName: string }): Promise<UndoResult>;
}

export interface UndoEntryInput {
  /** The entry's client request id. */
  id: string;
  message: string;
  tenantId: string;
  actorName: string;
  queue: UndoQueue;
  /** Re-reads the expense lists. */
  refresh: () => Promise<void>;
  /** After it was sent or undone — the drawer re-reads its cash (`onCommitted`). */
  onSettled?: () => void;
}

export function buildUndoEntry(input: UndoEntryInput): UndoEntry {
  const { id, message, tenantId, actorName, queue, refresh, onSettled } = input;
  return {
    id,
    message,
    commit: async () => {
      try {
        const result = await queue.commit(tenantId, id);
        if (result.sent.size > 0) await refresh();
      } finally {
        onSettled?.();
      }
    },
    undo: async () => {
      try {
        const outcome = await queue.undo({ tenantId, requestId: id, actorName });
        if (outcome.status === "undone") await refresh();
        return outcome;
      } finally {
        onSettled?.();
      }
    },
  };
}

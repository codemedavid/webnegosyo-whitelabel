/**
 * One queued expense → one attempt against the platform, as a queue outcome.
 *
 * Pure apart from the injected client: the network/refusal split is the whole
 * point. A failure that may not have reached the server is retried (the
 * request id makes a replay safe); a refusal the server will repeat forever is
 * kept with its reason for a person to read.
 */

import { ExpenseWriteError, recordDrawerExpense, recordExpense, type ExpenseDb } from "./expense-service";
import type { QueuedExpense, SendOutcome } from "./expense-queue";

/** Codes that mean "the server said no and will keep saying it". */
const PERMANENT_CODES: ReadonlySet<string> = new Set([
  "42501", // not allowed
  "22023", // note_required, drawer_locked, bad argument
  "23514", // check constraint (amount, date range)
  "23503", // category / supplier / shift gone
  "P0001", // a guard's raise (closed shift)
  "P0002", // already voided
  "23505", // a pay-out already sorted
]);

export function outcomeForError(error: unknown): SendOutcome {
  if (error instanceof ExpenseWriteError) {
    if (error.isNetwork) return { status: "retry" };
    // Expenses not switched on yet: keep it waiting, the store may be mid-update.
    if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") return { status: "retry" };
    if (error.code && PERMANENT_CODES.has(error.code)) return { status: "refused", reason: error.message };
    return { status: "retry" };
  }
  return { status: "retry" };
}

export async function sendQueuedExpense(db: ExpenseDb, entry: QueuedExpense): Promise<SendOutcome> {
  try {
    const expenseId =
      entry.payload.kind === "book"
        ? await recordExpense(db, entry.tenantId, entry.payload.draft, entry.payload.createdByName)
        : await recordDrawerExpense(db, entry.payload.input);
    return { status: "sent", expenseId };
  } catch (error) {
    return outcomeForError(error);
  }
}

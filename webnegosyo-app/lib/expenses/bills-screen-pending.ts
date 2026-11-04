/**
 * Bill payments still on this phone (queued, inside the Undo window, or
 * offline) count on the board as PROVISIONAL payments. Without them a second
 * "Mark paid" targeted the same due date and the database refused it, and the
 * late reminder kept firing for a bill already paid. Pure; the board hook
 * merges them (`use-bills.ts`).
 *
 * A provisional payment carries `queued:<client request id>` as its expense
 * id: there is no expense to open yet, and the row says "waiting to send".
 */

import type { BillPayment } from "./bill-schedule";
import type { BillBoard } from "./bills-service";
import type { QueuedExpense } from "./expense-queue";

export const PENDING_PAYMENT_PREFIX = "queued:";

/** A payment that is still on this phone, not yet an expense on the server. */
export function isPendingPayment(payment: Pick<BillPayment, "expenseId">): boolean {
  return payment.expenseId.startsWith(PENDING_PAYMENT_PREFIX);
}

const keyOf = (billId: string, dueOn: string) => `${billId}|${dueOn}`;

/**
 * Every waiting, non-refused book expense that pays a bill, as a payment —
 * except due dates the server already shows paid (sent, queue not cleared).
 */
export function pendingBillPayments(queued: readonly QueuedExpense[], recorded: readonly BillPayment[]): BillPayment[] {
  const paid = new Set(recorded.map((payment) => keyOf(payment.billId, payment.dueOn)));
  const pending: BillPayment[] = [];
  for (const entry of queued) {
    if (entry.refusedReason !== null || entry.payload.kind !== "book") continue;
    const { draft } = entry.payload;
    if (!draft.billId || !draft.billDueOn) continue;
    const key = keyOf(draft.billId, draft.billDueOn);
    if (paid.has(key)) continue;
    paid.add(key);
    pending.push({
      billId: draft.billId,
      dueOn: draft.billDueOn,
      expenseId: `${PENDING_PAYMENT_PREFIX}${entry.id}`,
      amountCents: draft.amountCents,
      spentOn: draft.spentOn,
    });
  }
  return pending;
}

/** The board with this phone's waiting bill payments added (only for bills on it). Same object when none. */
export function withPendingPayments(board: BillBoard, queued: readonly QueuedExpense[]): BillBoard {
  const billIds = new Set(board.bills.map((bill) => bill.id));
  const pending = pendingBillPayments(queued, board.payments).filter((payment) => billIds.has(payment.billId));
  if (pending.length === 0) return board;
  return { ...board, payments: [...board.payments, ...pending] };
}

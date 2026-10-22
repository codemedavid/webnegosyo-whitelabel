import { useRef, useState } from "react";

import {
  createBill,
  endBill,
  linkExpenseToBill,
  markBill,
  pauseBill,
  resumeBill,
  unlinkExpenseFromBill,
  unmarkBill,
  updateBill,
  type BillInput,
} from "../../../lib/expenses/bills-service";
import type { Bill } from "../../../lib/expenses/bill-schedule";
import { liveExpenseDb } from "../../../lib/expenses/expense-client";
import { useInvalidateBills } from "../../../lib/expenses/use-bills";
import { useExpenseTenant, useInvalidateExpenses } from "../../../lib/expenses/use-expenses";
import { refuseInDemo } from "../detail/use-expense-detail-writes";

export type BillWriteResult<T> = { ok: true; value: T } | { ok: false; message: string | null };

const FALLBACK = "That did not save. Try again.";

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK;
}

/**
 * Every bill write the screen makes, one at a time (a double tap never marks
 * twice), refused in demo mode, and followed by the re-read it needs: a bill
 * or mark write re-reads the board; linking an expense re-reads the book too.
 * A refusal comes back as words for the sheet, never as a thrown error.
 */
export function useBillWrites() {
  const tenantId = useExpenseTenant();
  const refreshBills = useInvalidateBills();
  const refreshExpenses = useInvalidateExpenses();
  const inFlight = useRef(false);
  const [isBusy, setIsBusy] = useState(false);

  const run = async <T,>(write: (tenant: string) => Promise<T>, touchesExpenses = false): Promise<BillWriteResult<T>> => {
    if (inFlight.current || !tenantId) return { ok: false, message: null };
    if (refuseInDemo()) return { ok: false, message: null };
    inFlight.current = true;
    setIsBusy(true);
    try {
      const value = await write(tenantId);
      const refresh = touchesExpenses ? refreshExpenses : refreshBills;
      refresh().catch((error: unknown) => console.warn("[bills] could not re-read the board", error));
      return { ok: true, value };
    } catch (error) {
      return { ok: false, message: messageOf(error) };
    } finally {
      inFlight.current = false;
      setIsBusy(false);
    }
  };

  return {
    isBusy,
    create: (input: BillInput, today: string) => run<Bill>((tenant) => createBill(liveExpenseDb, tenant, input, today)),
    /** The stored bill decides the start (bills-contract §4); changes apply from the next due date. */
    update: (billId: string, input: BillInput, today: string) =>
      run<Bill>((tenant) => updateBill(liveExpenseDb, tenant, billId, input, today)),
    /** `until` must be after `today` (Manila); null = until resumed by hand. */
    pause: (billId: string, until: string | null, today: string) =>
      run<Bill>((tenant) => pauseBill(liveExpenseDb, tenant, billId, until, today)),
    resume: (billId: string, today: string) => run<Bill>((tenant) => resumeBill(liveExpenseDb, tenant, billId, today)),
    end: (billId: string) => run<Bill>((tenant) => endBill(liveExpenseDb, tenant, billId)),
    skip: (billId: string, dueOn: string) =>
      run((tenant) => markBill(liveExpenseDb, tenant, { billId, dueOn, kind: "skipped" })),
    /** "Remind me tomorrow" for every due date a row stands for (a collapsed late row: all of them), one after another. */
    snooze: (billId: string, dueOns: readonly string[], until: string) =>
      run(async (tenant) => {
        for (const dueOn of dueOns) {
          await markBill(liveExpenseDb, tenant, { billId, dueOn, kind: "snoozed", snoozedUntil: until });
        }
      }),
    unmark: (billId: string, dueOn: string) => run((tenant) => unmarkBill(liveExpenseDb, tenant, billId, dueOn)),
    link: (expenseId: string, billId: string, dueOn: string) =>
      run((tenant) => linkExpenseToBill(liveExpenseDb, tenant, expenseId, billId, dueOn), true),
    /** "Not for this bill": the expense stays as it is; its due date is open again. */
    unlink: (expenseId: string) => run((tenant) => unlinkExpenseFromBill(liveExpenseDb, tenant, expenseId), true),
  };
}

export type BillWrites = ReturnType<typeof useBillWrites>;

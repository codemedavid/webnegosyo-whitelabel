import { BILL_TODAY, billOf, paymentOf } from "./bills-fixtures";
import { buildBillsView, findBillRow, targetDueOn } from "./bills-screen";
import { isPendingPayment, pendingBillPayments, withPendingPayments } from "./bills-screen-pending";
import type { QueuedExpense } from "./expense-queue";
import type { ExpenseDraft } from "./types";

const internet = billOf({
  id: "bill-internet",
  name: "Internet",
  categoryId: "internet",
  amountCents: 169_900,
  rule: { kind: "monthly", day: 5 },
  startsOn: "2026-07-01",
});

function draftOf(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    amountCents: 169_900,
    categoryId: "internet",
    spentOn: BILL_TODAY,
    paidFrom: "gcash",
    outletId: null,
    clientRequestId: "req-1",
    billId: "bill-internet",
    billDueOn: "2026-08-05",
    ...overrides,
  };
}

function queued(overrides: Partial<QueuedExpense> = {}, draft: Partial<ExpenseDraft> = {}): QueuedExpense {
  return {
    id: "req-1",
    tenantId: "t1",
    userId: "u1",
    payload: { kind: "book", draft: draftOf(draft), createdByName: "Ana" },
    categoryName: "Internet",
    attempts: 0,
    retryAt: null,
    createdAt: 0,
    refusedReason: null,
    ...overrides,
  };
}

describe("pendingBillPayments", () => {
  it("turns a bill payment still on this phone into a provisional payment", () => {
    // Act
    const [payment] = pendingBillPayments([queued()], []);

    // Assert
    expect(payment).toEqual({
      billId: "bill-internet",
      dueOn: "2026-08-05",
      expenseId: "queued:req-1",
      amountCents: 169_900,
      spentOn: BILL_TODAY,
    });
    expect(isPendingPayment(payment)).toBe(true);
    expect(isPendingPayment(paymentOf())).toBe(false);
  });

  it("counts held (Undo window) and offline entries, never refused ones, plain expenses or drawer pay-outs", () => {
    const held = queued({ id: "held", retryAt: Date.now() + 6_000 }, { clientRequestId: "held", billDueOn: "2026-09-05" });
    const refused = queued({ id: "refused", refusedReason: "Not allowed" }, { billDueOn: "2026-10-05" });
    const plain = queued({ id: "plain" }, { billId: null, billDueOn: null });
    const drawer: QueuedExpense = {
      ...queued({ id: "drawer" }),
      payload: { kind: "drawer", input: {} as never },
    };

    const dueOns = pendingBillPayments([held, refused, plain, drawer], []).map((payment) => payment.dueOn);

    expect(dueOns).toEqual(["2026-09-05"]);
  });

  it("drops one the server already has (sent, the queue not yet cleared)", () => {
    const recorded = [paymentOf({ billId: "bill-internet", dueOn: "2026-08-05", expenseId: "e1" })];
    expect(pendingBillPayments([queued()], recorded)).toEqual([]);
  });
});

describe("withPendingPayments on the board", () => {
  const board = { bills: [internet], marks: [], payments: [] };

  it("shows the paid date as Paid · waiting to send, and the next Mark paid moves on to the next late month", () => {
    // Arrange: August, September and October unpaid; August paid from this phone, not sent yet.
    const merged = withPendingPayments(board, [queued()]);

    // Act
    const view = buildBillsView({ ...merged, today: BILL_TODAY });

    // Assert
    const late = findBillRow(view, "bill-internet")!;
    expect(late.occurrence.lateCount).toBe(2);
    expect(targetDueOn(late.occurrence)).toBe("2026-09-05");
  });

  it("labels a this-month payment waiting on the phone", () => {
    const merged = withPendingPayments(board, [queued({}, { billDueOn: "2026-10-05" })]);
    const view = buildBillsView({ ...merged, today: BILL_TODAY });
    const settled = view.groups.find((group) => group.key === "settled")!.rows;
    expect(settled.map((row) => row.pill)).toEqual([{ text: "Paid · waiting to send", tone: "paid" }]);
  });

  it("ignores a queued payment for a bill not on this board (another branch)", () => {
    const merged = withPendingPayments(board, [queued({}, { billId: "bill-elsewhere" })]);
    expect(merged.payments).toEqual([]);
  });

  it("leaves the board untouched when nothing is waiting", () => {
    expect(withPendingPayments(board, [])).toBe(board);
  });
});

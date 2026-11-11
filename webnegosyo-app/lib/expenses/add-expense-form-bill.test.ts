import {
  categoriesForScope,
  formForOpening,
  primaryLabel,
  sheetTitle,
  toBookDraft,
} from "./add-expense-form";
import { BILL_CATEGORIES } from "./bills-fixtures";
import type { BillPayContext } from "./bills-screen";
import { keypadCents } from "./keypad";

const today = "2026-10-22";
const book = { kind: "book" as const };
const rent: BillPayContext = {
  billId: "bill-rent",
  dueOn: "2026-10-24",
  name: "Rent",
  amountCents: 1_500_000,
  usualCents: null,
  lastCents: null,
  categoryId: "rent",
  paidFrom: "bank",
  paidToName: "Aling Nena",
  supplierId: "sup-1",
  outletId: null,
};
const kuryente: BillPayContext = { ...rent, billId: "bill-k", name: "Kuryente", amountCents: null, usualCents: 610_000, lastCents: 640_000, categoryId: "electricity" };

describe("paying a bill", () => {
  it("opens with a fixed bill's amount, its category, source and payee", () => {
    const form = formForOpening({ today, paidFrom: "cash", bill: rent });
    expect(keypadCents(form.keypad)).toBe(1_500_000);
    expect(form).toMatchObject({ categoryId: "rent", paidFrom: "bank", paidToName: "Aling Nena", spentOn: today });
  });

  it("leaves a changing bill's amount for the owner to type", () => {
    expect(keypadCents(formForOpening({ today, paidFrom: "cash", bill: kuryente }).keypad)).toBe(0);
  });

  it("titles and labels the sheet for the bill", () => {
    expect(sheetTitle(book, "spend", rent)).toBe("Pay Rent");
    expect(primaryLabel(1_500_000, book, "spend", true, rent)).toBe("Save ₱15,000 · Rent paid");
    expect(primaryLabel(0, book, "spend", true, kuryente)).toBe("Type what you paid for Kuryente");
  });

  it("links the saved expense to the due date and keeps the bill's supplier", () => {
    const category = BILL_CATEGORIES[0];
    const form = formForOpening({ today, paidFrom: "cash", bill: rent });
    const draft = toBookDraft(form, { clientRequestId: "r1", outletId: null, tracksStock: false, category, bill: rent });
    expect(draft).toMatchObject({ billId: "bill-rent", billDueOn: "2026-10-24", supplierId: "sup-1", amountCents: 1_500_000 });
  });

  it("an ordinary expense carries no bill", () => {
    const draft = toBookDraft(formForOpening({ today, paidFrom: "cash" }), {
      clientRequestId: "r2",
      outletId: null,
      tracksStock: false,
      category: BILL_CATEGORIES[0],
    });
    expect(draft.billId).toBeUndefined();
    expect(draft.billDueOn).toBeUndefined();
  });

  it("keeps a bill's cash-moved category (a loan payment) on offer", () => {
    const loan = { ...rent, categoryId: "loan_payment" };
    expect(categoriesForScope(BILL_CATEGORIES, "spend").map((c) => c.id)).not.toContain("loan_payment");
    expect(categoriesForScope(BILL_CATEGORIES, "spend", loan).map((c) => c.id)).toContain("loan_payment");
  });
});

describe("the device queue keeps the bill link", () => {
  it("stores and reloads a payment's billId and billDueOn, and refuses a second payment in plain words", async () => {
    const { EXPENSE_QUEUE_STORAGE_KEY, createExpenseQueue, parseExpenseQueue } = await import("./expense-queue");
    const { outcomeForError } = await import("./expense-sync");
    const { ExpenseWriteError, describeExpenseError } = await import("./expense-service");
    const data: Record<string, string> = {};
    const storage = { getItem: async (key: string) => data[key] ?? null, setItem: async (key: string, value: string) => void (data[key] = value) };
    const queue = createExpenseQueue({ storage, send: jest.fn() });
    const draft = toBookDraft(formForOpening({ today, paidFrom: "cash", bill: rent }), {
      clientRequestId: "pay-1",
      outletId: null,
      tracksStock: false,
      category: BILL_CATEGORIES[0],
      bill: rent,
    });

    await queue.enqueue({ tenantId: "t1", categoryName: "Rent", payload: { kind: "book", createdByName: "Ana", draft } });

    const [stored] = parseExpenseQueue(data[EXPENSE_QUEUE_STORAGE_KEY]);
    expect(stored.payload).toMatchObject({ kind: "book", draft: { billId: "bill-rent", billDueOn: "2026-10-24" } });

    const words = describeExpenseError({ code: "23505", message: 'duplicate key value violates unique constraint "expenses_bill_due_recorded_uq"' });
    expect(words).toBe("That bill is already marked paid for this due date. Open Bills to pay to check it.");
    expect(outcomeForError(new ExpenseWriteError(words, { code: "23505" }))).toEqual({ status: "refused", reason: words });
  });
});

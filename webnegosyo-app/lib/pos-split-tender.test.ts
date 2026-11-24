import type { TenderLine } from "./bill/split-tender";
import { addLine, type PosCartLine } from "./pos-cart";
import { buildPosOrder, isPosPayLater, readPosPayment } from "./pos-order";
import type { PosPaymentMethod } from "./pos-payment-methods";
import { posReceiptOrder } from "./pos-receipt";
import {
  canSplitAtRegister,
  splitLedgerRows,
  splitReceiptTender,
  splitRecord,
  validatePosSplit,
} from "./pos-split-tender";

function method(id: string, name: string): PosPaymentMethod {
  return { id, name, details: null, qr_code_url: null, require_payment_proof: false, order_index: 0 };
}

const CASH = method("m-cash", "Cash");
const GCASH = method("m-gcash", "GCash");
const METHODS = [GCASH, CASH];

function line(key: string, methodId: string | null, amount = "", extra: Partial<TenderLine> = {}): TenderLine {
  return { key, methodId, amount, cash: "", reference: "", ...extra };
}

describe("validatePosSplit · the register's split", () => {
  it("₱200 cash and the rest by GCash covers the sale, one payment per method", () => {
    const verdict = validatePosSplit(
      [line("t1", "m-cash", "200"), line("t2", "m-gcash", "", { reference: "REF1" })],
      METHODS,
      540,
    );
    expect(verdict).toEqual({
      ok: true,
      payments: [
        { amount: 200, methodId: "m-cash", methodName: "Cash", cashTendered: 200, changeDue: 0 },
        { amount: 340, methodId: "m-gcash", methodName: "GCash", reference: "REF1" },
      ],
    });
  });

  it("takes the cash handed over for the cash part and works out its change", () => {
    const verdict = validatePosSplit(
      [line("t1", "m-gcash", "340", { reference: "REF1" }), line("t2", "m-cash", "", { cash: "500" })],
      METHODS,
      540,
    );
    expect(verdict.ok && verdict.payments[1]).toEqual({
      amount: 200,
      methodId: "m-cash",
      methodName: "Cash",
      cashTendered: 500,
      changeDue: 300,
    });
  });

  it("refuses a split that leaves part of the sale unpaid (pay later is the way to do that)", () => {
    const verdict = validatePosSplit(
      [line("t1", "m-cash", "200"), line("t2", "m-gcash", "100", { reference: "REF1" })],
      METHODS,
      540,
    );
    expect(verdict).toEqual({
      ok: false,
      error: "₱240.00 is still owed. Add it to a line, or leave the last amount blank for the rest.",
    });
  });

  it("refuses more than the sale", () => {
    const verdict = validatePosSplit([line("t1", "m-cash", "400"), line("t2", "m-gcash", "200")], METHODS, 540);
    expect(verdict.ok).toBe(false);
  });

  it("asks for every non-cash line's reference, as the single-method screen asks for a reference or photo", () => {
    expect(validatePosSplit([line("t1", "m-cash", "200"), line("t2", "m-gcash")], METHODS, 540)).toEqual({
      ok: false,
      error: "Enter the GCash reference number.",
    });
    expect(
      validatePosSplit([line("t1", "m-cash", "200"), line("t2", "m-gcash", "", { reference: "REF-9" })], METHODS, 540).ok,
    ).toBe(true);
  });

  it("passes the collect sheet's own refusals through (a line without a method)", () => {
    expect(validatePosSplit([line("t1", null, "200"), line("t2", "m-gcash")], METHODS, 540)).toEqual({
      ok: false,
      error: "Choose how payment 1 was paid.",
    });
  });
});

describe("canSplitAtRegister", () => {
  it("needs a second method and a new sale", () => {
    expect(canSplitAtRegister({ methodCount: 2, isEditing: false })).toBe(true);
    expect(canSplitAtRegister({ methodCount: 1, isEditing: false })).toBe(false);
    expect(canSplitAtRegister({ methodCount: 3, isEditing: true })).toBe(false);
  });
});

describe("splitLedgerRows", () => {
  it("one charge row per line, the cash row noting what was handed over", () => {
    const rows = splitLedgerRows(
      [
        { amount: 200, methodId: "m-cash", methodName: "Cash", cashTendered: 500, changeDue: 300 },
        { amount: 340, methodId: "m-gcash", methodName: "GCash", reference: "REF1" },
      ],
      { orderId: "o-1", recordedBy: "u-1", outletId: "b-1" },
    );
    expect(rows).toEqual([
      {
        orderId: "o-1",
        kind: "charge",
        amount: 200,
        paymentMethodId: "m-cash",
        paymentMethodName: "Cash",
        recordedBy: "u-1",
        outletId: "b-1",
        note: "Cash received ₱500.00 · change ₱300.00",
      },
      {
        orderId: "o-1",
        kind: "charge",
        amount: 340,
        paymentMethodId: "m-gcash",
        paymentMethodName: "GCash",
        reference: "REF1",
        recordedBy: "u-1",
        outletId: "b-1",
      },
    ]);
  });
});

describe("splitReceiptTender", () => {
  it("names every method and carries the cash part's change", () => {
    expect(
      splitReceiptTender([
        { amount: 340, methodId: "m-gcash", methodName: "GCash", reference: "REF1" },
        { amount: 200, methodId: "m-cash", methodName: "Cash", cashTendered: 500, changeDue: 300 },
      ]),
    ).toEqual({ methodName: "GCash + Cash", isCash: true, cashTendered: 500, changeDue: 300, reference: "REF1" });
  });

  it("no cash, no change", () => {
    expect(
      splitReceiptTender([
        { amount: 100, methodId: "a", methodName: "GCash" },
        { amount: 100, methodId: "b", methodName: "Maya" },
      ]),
    ).toEqual({ methodName: "GCash + Maya", isCash: false });
  });
});

describe("buildPosOrder · a split sale", () => {
  const cart: PosCartLine[] = addLine([], {
    menuItemId: "m-1",
    name: "Sisig",
    basePrice: 270,
    quantity: 2,
    selections: [],
  });
  const payments = [
    { amount: 200, methodId: "m-cash", methodName: "Cash", cashTendered: 500, changeDue: 300 },
    { amount: 340, methodId: "m-gcash", methodName: "GCash" },
  ];
  const base = { cart, tender: null, clientOrderId: "cid-1", cashierId: "u-1" };

  it("is written with its lines and NO single method — the ledger carries the money", () => {
    const args = buildPosOrder({ ...base, split: splitRecord(payments) });
    expect(args.total).toBe(540);
    expect(args.paymentMethod).toBeUndefined();
    expect(readPosPayment(args.customerData)).toEqual({ split: payments, cashierId: "u-1" });
    // Not a pay-later sale: nothing is owed after the counter.
    expect(isPosPayLater(args.customerData)).toBe(false);
  });

  it("refuses lines that do not add up to the sale", () => {
    expect(() => buildPosOrder({ ...base, split: [{ amount: 200, methodId: "m-cash", methodName: "Cash" }] })).toThrow(
      "The split payments do not add up to this sale.",
    );
  });

  it("refuses a split and a single tender at once", () => {
    expect(() =>
      buildPosOrder({ ...base, tender: { methodName: "Cash", isCash: true, cashTendered: 540 }, split: splitRecord(payments) }),
    ).toThrow("A split sale is settled by its lines, not one tender.");
  });

  it("prints as paid in full, naming both methods with the cash part's change", () => {
    const args = buildPosOrder({ ...base, split: splitRecord(payments) });
    const tender = splitReceiptTender(payments);
    const receipt = { ...posReceiptOrder("o-1", args, tender, 0), paymentMethod: tender.methodName };
    expect(receipt).toMatchObject({
      paymentMethod: "Cash + GCash",
      cashTendered: 500,
      changeDue: 300,
      amountPaid: 540,
    });
  });
});

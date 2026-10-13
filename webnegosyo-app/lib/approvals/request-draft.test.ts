import {
  checkDraft,
  draftSignature,
  keyForSend,
  draftAmount,
  initialDraft,
  sheetSubtitle,
  submitLabel,
  withAmountText,
  withNote,
  withQuantity,
  withReason,
  withRestock,
  withScope,
  type RequestOrder,
} from "./request-draft";

const ORDER: RequestOrder = {
  orderId: "11111111-1111-4111-8111-111111111111",
  orderLabel: "#14",
  refundable: 480,
  paymentLabel: "cash",
  createdAt: "2026-10-12T01:00:00.000Z",
  outletId: null,
  items: [
    { id: "i-sisig", name: "Chicken Sisig", quantity: 2, lineTotal: 370 },
    { id: "i-rice", name: "Garlic Rice", quantity: 2, lineTotal: 110 },
  ],
};

const KEY = "sheet_abc_12345678";

describe("request draft", () => {
  test("starts with no reason, nothing picked and stock not put back", () => {
    const draft = initialDraft("refund");
    expect(draft).toMatchObject({ kind: "refund", scope: "items", reasonCode: null, restock: false });
    expect(checkDraft(draft, ORDER, KEY)).toEqual({ ok: false, hint: "Pick the items to refund" });
  });

  test("a reason pre-sets the stock switch until the cashier touches it", () => {
    const wrongItem = withReason(initialDraft("refund"), "wrong_item");
    expect(wrongItem.restock).toBe(false);
    const changedMind = withReason(wrongItem, "changed_mind");
    expect(changedMind.restock).toBe(true);
    const touched = withRestock(changedMind, false);
    expect(withReason(touched, "missing_item").restock).toBe(false);
  });

  test("items mode prices the pieces picked, clamped to what is on the order", () => {
    const draft = withQuantity(withQuantity(initialDraft("refund"), ORDER.items[0], 1), ORDER.items[1], 9);
    expect(draft.quantities).toEqual({ "i-sisig": 1, "i-rice": 2 });
    expect(draftAmount(draft, ORDER)).toBe(295);
    expect(draftAmount(withQuantity(draft, ORDER.items[1], -3), ORDER)).toBe(185);
  });

  test("picking every piece asks for Whole order instead", () => {
    const all = withQuantity(withQuantity(initialDraft("refund"), ORDER.items[0], 2), ORDER.items[1], 2);
    expect(checkDraft(withReason(all, "wrong_item"), ORDER, KEY)).toEqual({
      ok: false,
      hint: "That is every item. Choose Whole order instead.",
    });
  });

  test("amount mode keeps a peso amount and refuses more than can be refunded", () => {
    const typed = withAmountText(withScope(initialDraft("refund"), "amount"), "1a85.505");
    expect(typed.amountText).toBe("185.50");
    expect(draftAmount(typed, ORDER)).toBe(185.5);
    const tooMuch = withReason(withAmountText(typed, "500"), "charged_twice");
    expect(checkDraft(tooMuch, ORDER, KEY)).toEqual({ ok: false, hint: "That's more than was paid. ₱480 can be refunded." });
    expect(checkDraft(withReason(withAmountText(typed, ""), "charged_twice"), ORDER, KEY)).toEqual({
      ok: false,
      hint: "Enter the amount to give back",
    });
  });

  test("whole order refunds what was paid", () => {
    expect(draftAmount(withScope(initialDraft("refund"), "whole"), ORDER)).toBe(480);
    expect(draftAmount(initialDraft("cancel_paid"), ORDER)).toBe(480);
  });

  test("the reason is required, and Other needs a detail", () => {
    const whole = withScope(initialDraft("refund"), "whole");
    expect(checkDraft(whole, ORDER, KEY)).toEqual({ ok: false, hint: "Pick a reason first" });
    const other = withReason(whole, "other");
    expect(checkDraft(other, ORDER, KEY)).toEqual({ ok: false, hint: "Add a detail for Other" });
    expect(checkDraft(withNote(other, "  Customer allergic  "), ORDER, KEY)).toMatchObject({ ok: true });
  });

  test("builds the create body the server expects", () => {
    const items = withReason(withQuantity(initialDraft("refund"), ORDER.items[0], 1), "wrong_item");
    expect(checkDraft(withNote(items, "Got pork instead"), ORDER, KEY)).toEqual({
      ok: true,
      amount: 185,
      input: {
        kind: "refund",
        orderId: ORDER.orderId,
        payload: { scope: "items", lines: [{ orderItemId: "i-sisig", quantity: 1 }], restock: false },
        reasonCode: "wrong_item",
        note: "Got pork instead",
        idempotencyKey: KEY,
      },
    });

    const amount = withReason(withAmountText(withScope(initialDraft("refund"), "amount"), "100"), "charged_twice");
    expect(checkDraft(amount, ORDER, KEY)).toMatchObject({
      ok: true,
      input: { payload: { scope: "amount", amount: 100 } },
    });

    const cancel = withReason(initialDraft("cancel_paid"), "customer_left");
    expect(checkDraft(cancel, ORDER, KEY)).toEqual({
      ok: true,
      amount: 480,
      input: { kind: "cancel_paid", orderId: ORDER.orderId, payload: { restock: true }, reasonCode: "customer_left", idempotencyKey: KEY },
    });
  });

  test("a seeded draft opens on the amount it was handed", () => {
    const seeded = initialDraft("refund", { scope: "amount", amount: 60 });
    expect(seeded.scope).toBe("amount");
    expect(seeded.amountText).toBe("60");
  });
});

describe("sheet copy", () => {
  test("the button names the outcome", () => {
    expect(submitLabel("refund", 185, "request")).toBe("Send for approval · ₱185");
    expect(submitLabel("refund", 185, "direct")).toBe("Refund ₱185 now");
    expect(submitLabel("cancel_paid", 480, "direct")).toBe("Cancel and refund ₱480 now");
    expect(submitLabel("cancel_paid", 480, "request")).toBe("Send for approval · ₱480");
    expect(submitLabel("refund", 0, "request")).toBe("Send for approval");
  });

  test("the subtitle names the order and how it was paid", () => {
    expect(sheetSubtitle(ORDER)).toBe("Order #14 · paid ₱480 cash");
    expect(sheetSubtitle({ ...ORDER, orderLabel: null, paymentLabel: null })).toBe("This order · paid ₱480");
  });
});

describe("retry keys (one request per intent, never one key for two bodies)", () => {
  const items = withReason(withQuantity(initialDraft("refund"), ORDER.items[0], 1), "wrong_item");

  test("a pure retry after a failed send keeps the key", () => {
    const signature = draftSignature(items, ORDER);
    expect(keyForSend({ currentKey: "k1", failedSignature: signature, signature, mint: () => "k2" })).toBe("k1");
    expect(keyForSend({ currentKey: "k1", failedSignature: null, signature, mint: () => "k2" })).toBe("k1");
  });

  test("an edit after a failed send gets a new key", () => {
    const before = draftSignature(items, ORDER);
    const after = draftSignature(withQuantity(items, ORDER.items[1], 1), ORDER);
    expect(after).not.toBe(before);
    expect(keyForSend({ currentKey: "k1", failedSignature: before, signature: after, mint: () => "k2" })).toBe("k2");
  });

  test("the signature covers kind, order, scope, amount, lines, reason and note", () => {
    const amount = withAmountText(withScope(items, "amount"), "100");
    expect(draftSignature(amount, ORDER)).not.toBe(draftSignature(withAmountText(amount, "90"), ORDER));
    expect(draftSignature(items, ORDER)).not.toBe(draftSignature(withNote(items, "x"), ORDER));
    expect(draftSignature(items, ORDER)).not.toBe(draftSignature(items, { ...ORDER, orderId: "other" }));
  });
});

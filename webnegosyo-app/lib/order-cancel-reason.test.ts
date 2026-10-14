import {
  CANCEL_REASONS,
  CANCEL_REASON_MAX,
  cancelReasonColumn,
  readOrderEventReason,
  stripOrderEventReason,
  validateCancelReason,
  withOrderEventReason,
} from "./order-cancel-reason";

describe("CANCEL_REASONS", () => {
  it("is the design spec's cancel list, with Other last", () => {
    expect(CANCEL_REASONS).toEqual([
      "Customer left",
      "Customer changed mind",
      "Ordered twice by mistake",
      "Wrong order entered",
      "Item ran out",
      "Store closing",
      "Other",
    ]);
  });
});

describe("validateCancelReason", () => {
  it("needs a reason before the button works", () => {
    expect(validateCancelReason({ reason: null, note: "" })).toEqual({ ok: false, hint: "Pick a reason first" });
  });

  it("needs a detail only for Other", () => {
    expect(validateCancelReason({ reason: "Other", note: "  " })).toEqual({ ok: false, hint: "Add a detail for Other" });
    expect(validateCancelReason({ reason: "Other", note: "Allergy" })).toEqual({
      ok: true,
      value: { reason: "Other", note: "Allergy" },
    });
    expect(validateCancelReason({ reason: "Customer left", note: " " })).toEqual({
      ok: true,
      value: { reason: "Customer left", note: null },
    });
  });

  it("refuses a reason that is not on the list", () => {
    expect(validateCancelReason({ reason: "Because", note: "" })).toEqual({ ok: false, hint: "Pick a reason first" });
  });
});

describe("cancelReasonColumn", () => {
  it("is the chip alone, or the chip and the note", () => {
    expect(cancelReasonColumn({ reason: "Customer left", note: null })).toBe("Customer left");
    expect(cancelReasonColumn({ reason: "Other", note: "Allergy" })).toBe("Other: Allergy");
  });

  it("fits the database's 500-character limit", () => {
    const long = cancelReasonColumn({ reason: "Other", note: "x".repeat(900) });
    expect(long.length).toBe(CANCEL_REASON_MAX);
  });
});

describe("order event reason args", () => {
  it("rides on the status mutation's args without touching the original", () => {
    const args = { orderId: "o1", status: "cancelled" };
    const withWhy = withOrderEventReason(args, { reason: "Customer left", note: null });
    expect(withWhy).toEqual({ orderId: "o1", status: "cancelled", reason: "Customer left" });
    expect(args).toEqual({ orderId: "o1", status: "cancelled" });
    expect(readOrderEventReason(withWhy)).toEqual({ reason: "Customer left", note: null });
  });

  it("is stripped before a backend that validates its args strictly (Convex)", () => {
    expect(stripOrderEventReason({ orderId: "o1", status: "cancelled", reason: "x", note: "y" })).toEqual({
      orderId: "o1",
      status: "cancelled",
    });
    expect(stripOrderEventReason(undefined)).toBeUndefined();
    expect(stripOrderEventReason("raw")).toBe("raw");
  });

  it("reads nothing from args without a reason", () => {
    expect(readOrderEventReason({ orderId: "o1" })).toEqual({ reason: null, note: null });
    expect(readOrderEventReason(null)).toEqual({ reason: null, note: null });
  });
});

import { receiptAmountPaid } from "./receipt-settlement";

describe("receiptAmountPaid", () => {
  it("reads a settled order as paid in full, whatever its ledger holds", () => {
    expect(receiptAmountPaid({ isUnpaid: false, total: 460, ledgerPaid: 0 })).toBe(460);
    expect(receiptAmountPaid({ isUnpaid: false, total: 460, ledgerPaid: undefined })).toBe(460);
  });

  it("reads an owing order's paid figure from its ledger", () => {
    expect(receiptAmountPaid({ isUnpaid: true, total: 460, ledgerPaid: 300 })).toBe(300);
    expect(receiptAmountPaid({ isUnpaid: true, total: 460, ledgerPaid: 0 })).toBe(0);
  });

  it("says nothing when an owing order's ledger cannot be trusted", () => {
    expect(receiptAmountPaid({ isUnpaid: true, total: 460, ledgerPaid: undefined })).toBeUndefined();
  });
});

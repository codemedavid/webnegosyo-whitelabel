import {
  isCashMethod,
  isProofOutstanding,
  requiresProof,
  toTender,
  type PosPaymentMethod,
} from "./pos-payment-methods";

function method(overrides: Partial<PosPaymentMethod> = {}): PosPaymentMethod {
  return {
    id: "pm-1",
    name: "GCash",
    details: "0917 000 1234 / Juan D.",
    qr_code_url: "https://ik.imagekit.io/x/qr/gcash.png",
    require_payment_proof: false,
    order_index: 0,
    ...overrides,
  };
}

describe("isCashMethod", () => {
  it("recognizes plainly-named cash methods", () => {
    expect(isCashMethod(method({ name: "Cash" }))).toBe(true);
    expect(isCashMethod(method({ name: "CASH" }))).toBe(true);
    expect(isCashMethod(method({ name: "Cash on Delivery" }))).toBe(true);
    expect(isCashMethod(method({ name: "COD" }))).toBe(true);
  });

  it("does not treat e-wallets or cards as cash", () => {
    expect(isCashMethod(method({ name: "GCash" }))).toBe(false);
    expect(isCashMethod(method({ name: "Maya" }))).toBe(false);
    expect(isCashMethod(method({ name: "Bank Transfer" }))).toBe(false);
    expect(isCashMethod(method({ name: "Credit Card" }))).toBe(false);
  });

  it("is not fooled by 'cash' appearing inside another word", () => {
    // "GCash" is the exact trap this guards: it ends in "cash" but is a wallet.
    expect(isCashMethod(method({ name: "GCash Express" }))).toBe(false);
  });
});

describe("requiresProof", () => {
  it("requires a confirmation photo for every non-cash method", () => {
    expect(requiresProof(method({ name: "GCash" }))).toBe(true);
    expect(requiresProof(method({ name: "Bank Transfer" }))).toBe(true);
  });

  it("does not gate a cash sale behind a photo", () => {
    expect(requiresProof(method({ name: "Cash" }))).toBe(false);
  });

  it("still honours an explicit proof requirement on a cash method", () => {
    expect(requiresProof(method({ name: "Cash", require_payment_proof: true }))).toBe(true);
  });
});

describe("isProofOutstanding", () => {
  it("blocks a wallet sale that carries neither a reference nor a photo", () => {
    expect(isProofOutstanding(method({ name: "GCash" }), {})).toBe(true);
  });

  it("accepts a typed reference number in place of a photo", () => {
    expect(isProofOutstanding(method({ name: "GCash" }), { reference: "0027431188" })).toBe(
      false,
    );
  });

  it("still accepts a photo when no reference was typed", () => {
    expect(isProofOutstanding(method({ name: "GCash" }), { hasProof: true })).toBe(false);
  });

  it("does not accept whitespace typed into the reference box", () => {
    expect(isProofOutstanding(method({ name: "GCash" }), { reference: "   " })).toBe(true);
  });

  it("asks nothing of a cash sale", () => {
    expect(isProofOutstanding(method({ name: "Cash" }), {})).toBe(false);
  });

  it("lets a reference satisfy a cash method the merchant flagged for proof", () => {
    expect(
      isProofOutstanding(method({ name: "Cash", require_payment_proof: true }), {
        reference: "REF-9",
      }),
    ).toBe(false);
  });
});

describe("toTender", () => {
  it("builds a cash tender carrying the amount given and the change owed", () => {
    const tender = toTender(method({ name: "Cash", qr_code_url: null }), {
      cashTendered: 500,
      changeDue: 172.5,
    });
    expect(tender).toEqual({
      methodName: "Cash",
      isCash: true,
      methodDetails: "0917 000 1234 / Juan D.",
      cashTendered: 500,
      changeDue: 172.5,
    });
  });

  it("builds a non-cash tender carrying the captured proof and reference", () => {
    const tender = toTender(method(), {
      proofUrl: "https://ik.imagekit.io/x/payment-proofs/a.jpg",
      proofFileId: "file_a",
      reference: "REF-1",
    });
    expect(tender).toMatchObject({
      methodName: "GCash",
      isCash: false,
      proofUrl: "https://ik.imagekit.io/x/payment-proofs/a.jpg",
      proofFileId: "file_a",
      reference: "REF-1",
    });
  });

  it("omits cash fields from a non-cash tender", () => {
    const tender = toTender(method(), { cashTendered: 500, changeDue: 10 });
    expect(tender.cashTendered).toBeUndefined();
    expect(tender.changeDue).toBeUndefined();
  });

  it("omits proof fields from a cash tender", () => {
    const tender = toTender(method({ name: "Cash" }), { proofUrl: "https://x/y.jpg" });
    expect(tender.proofUrl).toBeUndefined();
  });

  it("leaves methodDetails off when the merchant configured none", () => {
    expect(toTender(method({ details: null }), {}).methodDetails).toBeUndefined();
  });
});

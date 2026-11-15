import {
  canOfferPayLater,
  describeCompletedSale,
  tenderBlockedReason,
  tenderShape,
  tenderSwipeLabel,
  type TenderBlockInput,
} from "./pos-tender-mode";

const ready: TenderBlockInput = {
  mode: "now",
  isAlreadySettled: false,
  isRefund: false,
  refundGate: { allowed: true },
  hasMethod: true,
  wantsCashPad: true,
  isCashSufficient: true,
  isProofOutstanding: false,
};

describe("tenderBlockedReason", () => {
  it("lets a covered cash sale through", () => {
    expect(tenderBlockedReason(ready)).toBeUndefined();
  });

  it("asks for a method, then the cash, then the proof — in the order the cashier hits them", () => {
    expect(tenderBlockedReason({ ...ready, hasMethod: false })).toBe("Choose a payment method");
    expect(tenderBlockedReason({ ...ready, isCashSufficient: false })).toBe("Enter the cash received");
    expect(tenderBlockedReason({ ...ready, wantsCashPad: false, isProofOutstanding: true })).toBe(
      "Enter the reference number or photograph the confirmation",
    );
  });

  it("never blocks a pay-later sale on payment it is deliberately not taking", () => {
    expect(
      tenderBlockedReason({
        ...ready,
        mode: "later",
        hasMethod: false,
        isCashSufficient: false,
        isProofOutstanding: true,
      }),
    ).toBeUndefined();
  });

  it("refuses a refund the cashier may not give", () => {
    expect(
      tenderBlockedReason({
        ...ready,
        isRefund: true,
        refundGate: { allowed: false, reason: "Ask a manager" },
      }),
    ).toBe("Ask a manager");
  });

  it("needs nothing for an edit that is already square", () => {
    expect(tenderBlockedReason({ ...ready, isAlreadySettled: true, hasMethod: false })).toBeUndefined();
  });
});

describe("canOfferPayLater", () => {
  it("offers it on a new counter sale", () => {
    expect(canOfferPayLater({ isEditing: false })).toBe(true);
  });

  it("does not offer it while editing a placed order — that bill already has its own balance", () => {
    expect(canOfferPayLater({ isEditing: true })).toBe(false);
  });
});

describe("tenderSwipeLabel", () => {
  it("names the amount on an ordinary sale", () => {
    expect(tenderSwipeLabel({ mode: "now", edit: null, amountDue: 450 })).toBe("Swipe to complete  ₱450.00");
  });

  it("says plainly that a pay-later order is placed unpaid", () => {
    expect(tenderSwipeLabel({ mode: "later", edit: null, amountDue: 450 })).toBe(
      "Swipe to place order · pay later",
    );
  });

  it("says a chat order goes to the customer, whatever the mode", () => {
    expect(tenderSwipeLabel({ mode: "later", edit: null, amountDue: 450, isChatOrder: true })).toBe(
      "Swipe to send to the customer",
    );
    expect(tenderSwipeLabel({ mode: "now", edit: null, amountDue: 450, isChatOrder: true })).toBe(
      "Swipe to send to the customer",
    );
  });

  it("never uses the chat wording for an edit", () => {
    expect(tenderSwipeLabel({ mode: "now", edit: "settled", amountDue: 0, isChatOrder: true })).toBe(
      "Swipe to save the changes",
    );
  });

  it("keeps the edit wording", () => {
    expect(tenderSwipeLabel({ mode: "now", edit: "settled", amountDue: 0 })).toBe("Swipe to save the changes");
    expect(tenderSwipeLabel({ mode: "now", edit: "refund", amountDue: 20 })).toBe("Swipe to refund  ₱20.00");
    expect(tenderSwipeLabel({ mode: "now", edit: "collect", amountDue: 20 })).toBe(
      "Swipe to save and collect  ₱20.00",
    );
  });
});

describe("describeCompletedSale", () => {
  it("leads with the change for a cash sale — the next thing the cashier hands over", () => {
    expect(
      describeCompletedSale({ total: 450, changeDue: 50, isPayLater: false, isSavedOffline: false }),
    ).toEqual({ tone: "paid", title: "Give ₱50.00 change", detail: "₱450.00 sale saved · paid" });
  });

  it("says a sale with no change is simply paid", () => {
    expect(
      describeCompletedSale({ total: 450, changeDue: 0, isPayLater: false, isSavedOffline: false }),
    ).toEqual({ tone: "paid", title: "Sale saved · paid", detail: "₱450.00" });
  });

  it("tells the cashier a pay-later order is unpaid and where to collect it", () => {
    expect(
      describeCompletedSale({ total: 450, isPayLater: true, isSavedOffline: false }),
    ).toEqual({
      tone: "unpaid",
      title: "Order placed · ₱450.00 unpaid",
      detail: "Collect it from Orders when the customer pays.",
    });
  });

  it("tells the cashier a chat order went to the customer and is not in the kitchen yet", () => {
    expect(
      describeCompletedSale({ total: 518, isPayLater: true, isSavedOffline: false, sentToChat: "Ana C." }),
    ).toEqual({
      tone: "unpaid",
      title: "Order sent · ₱518.00 unpaid",
      detail: "Sent to Ana C. to confirm. It reaches the kitchen once they tap Confirm, or you confirm it.",
    });
    expect(
      describeCompletedSale({ total: 518, isPayLater: true, isSavedOffline: true, sentToChat: "Ana C." }).detail,
    ).toBe("Saved. Ana C. gets the order to confirm once this phone is back online.");
  });

  it("says when the sale is kept on this device", () => {
    expect(
      describeCompletedSale({ total: 450, changeDue: 0, isPayLater: false, isSavedOffline: true }).detail,
    ).toBe("₱450.00 · saved on this device, syncs when online");
  });
});

describe("tenderShape (a sale rung up for a Messenger chat)", () => {
  const base = { mode: "now" as const, hasChat: false, isEditing: false, isPlatformBackend: true };

  it("leaves an ordinary sale exactly as it was", () => {
    expect(tenderShape(base)).toEqual({
      isChatOrder: false,
      isPayLaterOffered: true,
      isPayLater: false,
      showsModeSwitch: true,
      showsPayLaterCard: false,
      printsKitchenChitNow: true,
      offersPhoneOnEveryType: false,
    });
    expect(tenderShape({ ...base, mode: "later" })).toMatchObject({ isPayLater: true, showsPayLaterCard: true, showsModeSwitch: true });
  });

  it("holds a chat order for the customer: unpaid, no pay-now switch, no chit yet, the phone kept", () => {
    expect(tenderShape({ ...base, hasChat: true })).toEqual({
      isChatOrder: true,
      isPayLaterOffered: true,
      isPayLater: true,
      showsModeSwitch: false,
      showsPayLaterCard: false,
      printsKitchenChitNow: false,
      offersPhoneOnEveryType: true,
    });
  });

  it("is never a chat order off the platform order system, or while editing a placed order", () => {
    expect(tenderShape({ ...base, hasChat: true, isPlatformBackend: false }).isChatOrder).toBe(false);
    const edit = tenderShape({ ...base, hasChat: true, isEditing: true });
    expect(edit).toMatchObject({ isChatOrder: false, isPayLaterOffered: false, isPayLater: false, showsModeSwitch: false, printsKitchenChitNow: true });
  });
});

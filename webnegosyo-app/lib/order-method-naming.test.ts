import { canNameOrderMethod, type MethodNamingInput } from "./order-method-naming";

const kokoPayLater: MethodNamingInput = {
  backend: "platform",
  status: "delivered",
  paymentStatus: "paid",
  paymentMethod: null,
  ledger: "available",
  ledgerRows: 0,
  user: { role: "admin", isOwner: true, permissions: null },
  isDemo: false,
  isOffline: false,
};

describe("canNameOrderMethod", () => {
  it("offers it on a paid sale with no method and an empty ledger (Koko's pay-later case)", () => {
    expect(canNameOrderMethod(kokoPayLater)).toBe(true);
  });

  it.each<[string, Partial<MethodNamingInput>]>([
    ["the order already names its method", { paymentMethod: "Cash Payment" }],
    ["the ledger has rows (they carry methods)", { ledgerRows: 1 }],
    ["the ledger is still loading", { ledgerRows: undefined }],
    ["the ledger could not be read", { ledger: "unavailable" }],
    ["the order is still unpaid (collect it instead)", { paymentStatus: "pending" }],
    ["the order was cancelled", { status: "cancelled" }],
    ["the store is on Convex (no such write there)", { backend: "convex" }],
    ["demo mode", { isDemo: true }],
    ["offline", { isOffline: true }],
    ["the person cannot take payments", { user: { role: "admin", isOwner: false, permissions: ["orders"] } }],
  ])("does not offer it when %s", (_why, change) => {
    expect(canNameOrderMethod({ ...kokoPayLater, ...change })).toBe(false);
  });
});

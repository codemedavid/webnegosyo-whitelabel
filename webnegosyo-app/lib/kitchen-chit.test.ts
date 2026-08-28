// The kitchen chit — the ticket the printer spits out for the cooks. It is not
// a receipt: no prices, no totals, no store branding. Just what to make, how,
// and any note the customer left, big and unambiguous.
import { buildKitchenChitText, buildKitchenChitSegments } from "./kitchen-chit";

const CHIT_ORDER = {
  _id: "j57abc123xyz789ef",
  _creationTime: new Date("2026-08-29T10:30:00").getTime(),
  customerName: "Maria Santos",
  orderType: "dine-in",
  items: [
    {
      menuItemName: "Burger",
      quantity: 2,
      subtotal: 350,
      variation: "Large",
      addons: [{ name: "Extra Cheese", price: 25 }],
      specialInstructions: "no onions",
    },
    { menuItemName: "Coke", quantity: 1, subtotal: 45 },
  ],
};

describe("buildKitchenChitText", () => {
  it("is headed KITCHEN with the short order reference", () => {
    const text = buildKitchenChitText(CHIT_ORDER);
    expect(text).toContain("KITCHEN");
    expect(text).toContain(CHIT_ORDER._id.slice(-8).toUpperCase());
  });

  it("lists every line as QTYx NAME with variation, addons, and note", () => {
    const text = buildKitchenChitText(CHIT_ORDER);
    expect(text).toContain("2x Burger");
    expect(text).toContain("Large");
    expect(text).toContain("+ Extra Cheese");
    expect(text).toContain("no onions");
    expect(text).toContain("1x Coke");
  });

  it("carries the order type and customer so the pass can route the plate", () => {
    const text = buildKitchenChitText(CHIT_ORDER);
    expect(text).toContain("Dine-in");
    expect(text).toContain("Maria Santos");
  });

  it("prints no money — chits are for cooks, not cashiers", () => {
    const text = buildKitchenChitText(CHIT_ORDER);
    expect(text).not.toContain("₱");
    expect(text).not.toContain("350");
    expect(text).not.toMatch(/total/i);
  });

  it("survives an order with no items", () => {
    const text = buildKitchenChitText({ ...CHIT_ORDER, items: [] });
    expect(text).toContain("KITCHEN");
  });
});

describe("buildKitchenChitSegments", () => {
  it("wraps the chit as a single text segment for printReceiptSegments", () => {
    const segments = buildKitchenChitSegments(CHIT_ORDER);
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe("text");
    if (segments[0].type === "text") {
      expect(segments[0].text).toContain("2x Burger");
    }
  });
});

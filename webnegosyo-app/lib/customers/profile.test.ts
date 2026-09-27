import {
  MAX_TOP_ITEMS,
  contactLinksFor,
  displayNameOf,
  distinctChannels,
  loyaltyKeyFor,
  parseTopItems,
} from "./profile";

describe("parseTopItems", () => {
  it("keeps well-formed items in order", () => {
    const items = parseTopItems([
      { name: "Classic Milktea", quantity: 2 },
      { name: "Baconsilog", quantity: 1 },
    ]);

    expect(items).toEqual([
      { name: "Classic Milktea", quantity: 2 },
      { name: "Baconsilog", quantity: 1 },
    ]);
  });

  it("returns nothing for a non-array value", () => {
    expect(parseTopItems(null)).toEqual([]);
    expect(parseTopItems({ name: "x" })).toEqual([]);
    expect(parseTopItems("[]")).toEqual([]);
  });

  it("drops entries without a usable name and coerces bad quantities to zero", () => {
    const items = parseTopItems([
      { name: "  ", quantity: 3 },
      { quantity: 3 },
      null,
      { name: "Halo Halo ", quantity: "nope" },
    ]);

    expect(items).toEqual([{ name: "Halo Halo", quantity: 0 }]);
  });

  it(`caps the list at ${MAX_TOP_ITEMS}`, () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `Item ${i}`, quantity: 1 }));

    expect(parseTopItems(many)).toHaveLength(MAX_TOP_ITEMS);
  });
});

describe("contactLinksFor", () => {
  it("builds call, text and email targets", () => {
    expect(contactLinksFor("+639171234567", "a@b.co")).toEqual({
      call: "tel:+639171234567",
      text: "sms:+639171234567",
      email: "mailto:a@b.co",
    });
  });

  it("returns nulls when the guest left no contact", () => {
    expect(contactLinksFor(null, "  ")).toEqual({ call: null, text: null, email: null });
  });
});

describe("loyaltyKeyFor", () => {
  it("prefers the phone", () => {
    expect(loyaltyKeyFor("+639171234567", "a@b.co")).toBe("phone:+639171234567");
  });

  it("falls back to a lower-cased email", () => {
    expect(loyaltyKeyFor(null, " A@B.co ")).toBe("email:a@b.co");
  });

  it("is null for a guest with neither", () => {
    expect(loyaltyKeyFor(null, null)).toBeNull();
  });
});

describe("displayNameOf", () => {
  it("names a blank guest", () => {
    expect(displayNameOf("   ")).toBe("Unnamed guest");
    expect(displayNameOf(null)).toBe("Unnamed guest");
  });

  it("trims a real name", () => {
    expect(displayNameOf(" david ")).toBe("david");
  });
});

describe("distinctChannels", () => {
  it("keeps the store's own spelling and drops case-insensitive repeats", () => {
    expect(distinctChannels(["Pick Up", "pick up", " Delivery ", "", "Dine In"])).toEqual([
      "Pick Up",
      "Delivery",
      "Dine In",
    ]);
  });
});

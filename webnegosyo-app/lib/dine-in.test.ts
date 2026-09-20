import { hasDineIn } from "./dine-in";

describe("hasDineIn", () => {
  it("is true when an enabled order type seats guests", () => {
    expect(hasDineIn([{ type: "pickup" }, { type: "dine_in" }])).toBe(true);
  });

  it("is false for a store that only hands food over the counter", () => {
    expect(hasDineIn([{ type: "pickup" }, { type: "delivery" }])).toBe(false);
  });

  it("is false with no order types at all", () => {
    expect(hasDineIn([])).toBe(false);
  });

  it("matches the machine kind, never the merchant's label", () => {
    expect(hasDineIn([{ type: "Dine In" }])).toBe(false);
    expect(hasDineIn([{ type: null }, { type: undefined }])).toBe(false);
  });
});

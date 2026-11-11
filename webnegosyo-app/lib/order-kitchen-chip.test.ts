import { kitchenChipLabel } from "./order-kitchen-chip";

describe("kitchenChipLabel", () => {
  it("says the kitchen confirmed while the order is being prepared", () => {
    expect(kitchenChipLabel("preparing")).toBe("✓ Kitchen confirmed");
  });

  it("keeps a shorter chip while a ready order waits to go out", () => {
    expect(kitchenChipLabel("ready")).toBe("✓ Kitchen");
  });

  it("drops the chip once delivered: a counter sale delivered at once never saw a kitchen", () => {
    expect(kitchenChipLabel("delivered")).toBeNull();
  });

  it("claims nothing before the kitchen, or on a cancelled order", () => {
    expect(kitchenChipLabel("pending")).toBeNull();
    expect(kitchenChipLabel("confirmed")).toBeNull();
    expect(kitchenChipLabel("cancelled")).toBeNull();
    expect(kitchenChipLabel(undefined)).toBeNull();
    expect(kitchenChipLabel("something-new")).toBeNull();
  });
});

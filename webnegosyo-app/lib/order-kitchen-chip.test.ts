import { kitchenChipLabel } from "./order-kitchen-chip";

describe("kitchenChipLabel", () => {
  it("says the kitchen confirmed while the order is being prepared", () => {
    expect(kitchenChipLabel("preparing")).toBe("✓ Kitchen confirmed");
  });

  it("keeps a shorter chip once the kitchen is done with it", () => {
    expect(kitchenChipLabel("ready")).toBe("✓ Kitchen");
    expect(kitchenChipLabel("delivered")).toBe("✓ Kitchen");
  });

  it("claims nothing before the kitchen, or on a cancelled order", () => {
    expect(kitchenChipLabel("pending")).toBeNull();
    expect(kitchenChipLabel("confirmed")).toBeNull();
    expect(kitchenChipLabel("cancelled")).toBeNull();
    expect(kitchenChipLabel(undefined)).toBeNull();
    expect(kitchenChipLabel("something-new")).toBeNull();
  });
});

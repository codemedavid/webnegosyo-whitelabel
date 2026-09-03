// The Scheduled tab is config-driven: it exists only for stores where at least
// one order type takes pre-orders (order_types.advance_order_enabled). The
// predicate mirrors the platform's flag convention — strict === true, so an
// absent or null column reads as off (see src/lib/outlets/multi-branch-flag.ts).
import { hasAdvanceOrdering } from "./advance-ordering";

describe("hasAdvanceOrdering", () => {
  it("is on when any order type takes pre-orders", () => {
    expect(
      hasAdvanceOrdering([
        { advance_order_enabled: false },
        { advance_order_enabled: true },
      ]),
    ).toBe(true);
  });

  it("is off when no order type takes pre-orders", () => {
    expect(hasAdvanceOrdering([{ advance_order_enabled: false }])).toBe(false);
    expect(hasAdvanceOrdering([])).toBe(false);
  });

  it("reads absent and null columns as off, never coercing", () => {
    expect(hasAdvanceOrdering([{}, { advance_order_enabled: null }])).toBe(false);
  });
});

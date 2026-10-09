import { allocateCents, fromCents, toCents } from "./money";

describe("money", () => {
  it("rounds pesos to whole centavos", () => {
    expect(toCents(149.995)).toBe(15000);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(fromCents(15000)).toBe(150);
  });

  it("splits an amount evenly with the spare centavos going to the first shares", () => {
    expect(allocateCents(1000, [1, 1, 1])).toEqual([334, 333, 333]);
  });

  it("splits by weight and always sums to the whole", () => {
    const shares = allocateCents(10001, [240, 87.5, 12.25]);

    expect(shares.reduce((a, b) => a + b, 0)).toBe(10001);
    expect(shares[0]).toBeGreaterThan(shares[1]);
  });

  it("falls back to an even split when every weight is zero", () => {
    expect(allocateCents(300, [0, 0, 0])).toEqual([100, 100, 100]);
  });

  it("returns nothing to split between nobody", () => {
    expect(allocateCents(300, [])).toEqual([]);
  });

  it("splits a negative amount (a discount) the same way", () => {
    expect(allocateCents(-1000, [1, 1, 1])).toEqual([-334, -333, -333]);
  });
});

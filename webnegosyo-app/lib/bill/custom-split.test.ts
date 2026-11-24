import { customProblemText, customShareCents, parseAmountCents } from "./custom-split";

describe("customShareCents", () => {
  it("gives the rest to the one guest left blank: Guest 1 pays ₱500, Guest 2 the rest", () => {
    expect(customShareCents(56000, 2, { 0: 50000 })).toEqual({
      shares: [50000, 6000],
      isTyped: [true, false],
      problem: null,
    });
  });

  it("shares the rest evenly between every blank guest", () => {
    expect(customShareCents(56000, 3, { 1: 20000 }).shares).toEqual([18000, 20000, 18000]);
    expect(customShareCents(1000, 4, { 0: 0 }).shares).toEqual([0, 334, 333, 333]);
  });

  it("splits evenly while nothing is typed", () => {
    expect(customShareCents(1000, 3, {})).toMatchObject({ shares: [334, 333, 333], problem: null });
  });

  it("flags amounts that add up to more than the bill, and gives blanks nothing", () => {
    expect(customShareCents(56000, 3, { 0: 40000, 1: 20000 })).toMatchObject({
      shares: [40000, 20000, 0],
      problem: { kind: "over", cents: 4000 },
    });
  });

  it("flags money nobody is asked for when every guest is typed", () => {
    expect(customShareCents(56000, 2, { 0: 30000, 1: 20000 }).problem).toEqual({ kind: "short", cents: 6000 });
    expect(customShareCents(56000, 2, { 0: 30000, 1: 26000 }).problem).toBeNull();
  });

  it("lets a blank guest owe nothing when the typed amounts cover the bill", () => {
    expect(customShareCents(56000, 3, { 0: 56000 })).toMatchObject({ shares: [56000, 0, 0], problem: null });
  });

  it("always adds up to the bill when there is no problem", () => {
    for (const [basis, guests, amounts] of [
      [99999, 7, { 2: 12345, 5: 1 }],
      [1, 5, {}],
      [56000, 20, { 0: 100, 19: 200 }],
    ] as const) {
      const split = customShareCents(basis, guests, amounts);
      expect(split.problem).toBeNull();
      expect(split.shares.reduce((a, b) => a + b, 0)).toBe(basis);
    }
  });

  it("ignores amounts for guests that are not on the split", () => {
    expect(customShareCents(1000, 2, { 5: 900 }).shares).toEqual([500, 500]);
  });

  it("words the problem with the peso amount", () => {
    expect(customProblemText({ kind: "over", cents: 4000 })).toMatch(/₱40\.00 more than the bill/);
    expect(customProblemText({ kind: "short", cents: 6000 })).toMatch(/₱60\.00 is not on anyone/);
  });
});

describe("parseAmountCents", () => {
  it("reads peso amounts as centavos", () => {
    expect(parseAmountCents("500")).toBe(50000);
    expect(parseAmountCents("1,250.5")).toBe(125050);
    expect(parseAmountCents("12.")).toBe(1200);
    expect(parseAmountCents(".75")).toBe(75);
    expect(parseAmountCents("0.1")).toBe(10);
  });

  it("reads blank as 'share the rest'", () => {
    expect(parseAmountCents("  ")).toBeNull();
  });

  it("refuses what is not an amount", () => {
    expect(parseAmountCents("1.2.3")).toBeUndefined();
    expect(parseAmountCents("-5")).toBeUndefined();
    expect(parseAmountCents("12.345")).toBeUndefined();
    expect(parseAmountCents("abc")).toBeUndefined();
  });
});

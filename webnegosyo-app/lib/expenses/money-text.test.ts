import { formatPesoShort, percentChange, pesoParts } from "./money-text";

describe("pesoParts", () => {
  it("splits the peso sign from the digits", () => {
    expect(pesoParts(4_823_000)).toEqual({ sign: "", symbol: "₱", body: "48,230" });
  });

  it("keeps centavos only when there are some", () => {
    expect(pesoParts(105_050).body).toBe("1,050.50");
  });

  it("carries a real minus for a loss", () => {
    expect(pesoParts(-320_000)).toEqual({ sign: "−", symbol: "₱", body: "3,200" });
  });
});

describe("formatPesoShort", () => {
  it.each([
    [984_000, "₱9,840"],
    [12_460_000, "₱124.6k"],
    [1_000_000, "₱10k"],
    [123_456_789, "₱1.2M"],
    [-340_000, "−₱3,400"],
    [-3_400_000, "−₱34k"],
    [0, "₱0"],
  ])("%d → %s", (cents, expected) => {
    expect(formatPesoShort(cents)).toBe(expected);
  });
});

describe("percentChange", () => {
  it("says how much more", () => {
    expect(percentChange(109, 100)).toEqual({ direction: "up", percent: 9 });
  });

  it("says how much less", () => {
    expect(percentChange(50, 100)).toEqual({ direction: "down", percent: 50 });
  });

  it("says nothing when there was nothing before", () => {
    expect(percentChange(500, 0)).toBeNull();
  });

  it("calls a rounding-level change the same", () => {
    expect(percentChange(1001, 1000)).toEqual({ direction: "same", percent: 0 });
  });
});

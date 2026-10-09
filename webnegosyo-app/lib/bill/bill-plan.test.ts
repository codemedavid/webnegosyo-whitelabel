import {
  EMPTY_PLAN,
  MAX_GUESTS,
  assignUnit,
  billKey,
  isPlanLocked,
  partPaidCents,
  recordPartPayment,
  setGuests,
  setMode,
} from "./bill-plan";

describe("bill plan", () => {
  it("keys a bill by its orders, whatever order they were picked in", () => {
    expect(billKey(["b", "a"])).toBe(billKey(["a", "b"]));
  });

  it("starts as one bill for two guests", () => {
    expect(EMPTY_PLAN).toMatchObject({ mode: "one", guests: 2 });
  });

  it("freezes what an even split divides when it is chosen", () => {
    const plan = setMode(EMPTY_PLAN, "even", 56000);

    expect(plan).toMatchObject({ mode: "even", basisCents: 56000 });
  });

  it("keeps guests between two and the most a split allows", () => {
    expect(setGuests(EMPTY_PLAN, 1).guests).toBe(2);
    expect(setGuests(EMPTY_PLAN, 99).guests).toBe(MAX_GUESTS);
  });

  it("moves a piece to a guest, and back to the table", () => {
    const given = assignUnit(EMPTY_PLAN, "u1", 1);
    expect(given.assignment).toEqual({ u1: 1 });

    expect(assignUnit(given, "u1", null).assignment).toEqual({});
  });

  it("forgets pieces held by guests who were removed", () => {
    const plan = setGuests(assignUnit(setGuests(EMPTY_PLAN, 3), "u1", 2), 2);

    expect(plan.assignment).toEqual({});
  });

  it("locks the split once a guest has paid, so shares cannot shift under them", () => {
    const paid = recordPartPayment(setMode(EMPTY_PLAN, "even", 1000), "even:0", 500);

    expect(isPlanLocked(paid)).toBe(true);
    expect(partPaidCents(paid, "even:0")).toBe(500);
    expect(setGuests(paid, 4)).toBe(paid);
    expect(setMode(paid, "items", 1000)).toBe(paid);
    expect(assignUnit(paid, "u1", 0)).toBe(paid);
  });

  it("adds up a guest who pays in two goes", () => {
    const plan = recordPartPayment(recordPartPayment(EMPTY_PLAN, "items:1", 300), "items:1", 200);

    expect(partPaidCents(plan, "items:1")).toBe(500);
  });
});

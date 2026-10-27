import { PICKUP_COPY, pesosToCents, pickupArgs, pickupLine, pickupTakerProblem } from "./shift-pickup";

describe("pickups name who took the cash", () => {
  it("requires a taker once the store can record one", () => {
    expect(pickupTakerProblem(null, true)).toBe(PICKUP_COPY.required);
    expect(pickupTakerProblem(null, false)).toBeNull();
    expect(pickupTakerProblem({ kind: "safe" }, true)).toBeNull();
  });

  it("maps a person or the safe onto record_cash_pickup", () => {
    expect(pickupArgs({ kind: "person", userId: "u1", name: "Maria" })).toEqual({ takenBy: "u1", toSafe: false });
    expect(pickupArgs({ kind: "safe" })).toEqual({ takenBy: null, toSafe: true });
    expect(pickupArgs(null)).toEqual({ takenBy: null, toSafe: false });
  });

  it("words the move", () => {
    expect(pickupLine({ kind: "person", userId: "u1", name: "Maria" })).toBe("Pickup · Maria");
    expect(pickupLine({ kind: "safe" })).toBe("Pickup · Store safe");
  });

  it("turns pesos into whole centavos without drift", () => {
    expect(pesosToCents(2500.1)).toBe(250010);
    expect(pesosToCents(0.29)).toBe(29);
  });
});

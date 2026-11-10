import { buildKitchenChitText } from "./kitchen-chit";
import { printManualKitchenChit } from "./kitchen-chit-reprint";

const ORDER = {
  _id: "j57abc123xyz789ef",
  _creationTime: new Date("2026-11-04T10:30:00").getTime(),
  customerName: "Maria Santos",
  items: [{ menuItemName: "Burger", quantity: 2 }],
};
const REPRINT_AT = new Date("2026-11-04T11:05:00").getTime();

describe("kitchen chit REPRINT line", () => {
  it("prints REPRINT and its time right under the KITCHEN header", () => {
    const lines = buildKitchenChitText(ORDER, { reprintAt: REPRINT_AT }).split("\n");
    expect(lines[0]).toContain("*** KITCHEN ***");
    expect(lines[1]?.trim()).toBe("*** REPRINT ***");
    expect(lines[2]).toMatch(/Reprinted \d{1,2}:\d{2}/);
  });

  it("changes nothing else on the chit", () => {
    const first = buildKitchenChitText(ORDER).split("\n");
    const again = buildKitchenChitText(ORDER, { reprintAt: REPRINT_AT }).split("\n");
    expect([again[0], ...again.slice(3)]).toEqual(first);
  });

  it("a first print (auto-print, the register) carries no mark", () => {
    expect(buildKitchenChitText(ORDER)).not.toContain("REPRINT");
    expect(buildKitchenChitText(ORDER, { reprintAt: Number.NaN })).not.toContain("REPRINT");
  });
});

describe("printManualKitchenChit", () => {
  const ledger = (already: readonly string[] = []) => {
    const held = new Set(already);
    return {
      held,
      claim: jest.fn(async (_kind: string, ids: readonly string[]) => {
        const fresh = ids.filter((id) => !held.has(id));
        fresh.forEach((id) => held.add(id));
        return fresh;
      }),
      release: jest.fn(async (_kind: string, ids: readonly string[]) => {
        ids.forEach((id) => held.delete(id));
      }),
    };
  };

  it("prints the first chit unmarked, and keeps the claim once paper came out", async () => {
    const deps = ledger();
    const print = jest.fn(async () => true);
    await expect(printManualKitchenChit("o1", REPRINT_AT, print, deps)).resolves.toBe(true);
    expect(print).toHaveBeenCalledWith({});
    expect(deps.claim).toHaveBeenCalledWith("kitchen", ["o1"]);
    expect(deps.held.has("o1")).toBe(true);
  });

  it("marks the chit REPRINT when this device already printed one, and never gives that claim back", async () => {
    const deps = ledger(["o1"]);
    const print = jest.fn(async () => false);
    await expect(printManualKitchenChit("o1", REPRINT_AT, print, deps)).resolves.toBe(false);
    expect(print).toHaveBeenCalledWith({ reprintAt: REPRINT_AT });
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.held.has("o1")).toBe(true);
  });

  it("kitchen printer off: the first chit is given back, so the retry prints unmarked (not REPRINT)", async () => {
    const deps = ledger();
    const print = jest.fn(async () => false);
    await expect(printManualKitchenChit("o1", REPRINT_AT, print, deps)).resolves.toBe(false);
    expect(deps.release).toHaveBeenCalledWith("kitchen", ["o1"]);
    expect(deps.held.has("o1")).toBe(false);

    print.mockResolvedValueOnce(true);
    await printManualKitchenChit("o1", REPRINT_AT + 60_000, print, deps);
    expect(print).toHaveBeenLastCalledWith({});
  });

  it("a print that throws gives the claim back too", async () => {
    const deps = ledger();
    const print = jest.fn(async () => {
      throw new Error("bluetooth");
    });
    await expect(printManualKitchenChit("o1", REPRINT_AT, print, deps)).resolves.toBe(false);
    expect(deps.held.has("o1")).toBe(false);
  });

  it("prints unmarked when the device's history cannot be read", async () => {
    const deps = ledger();
    deps.claim.mockRejectedValueOnce(new Error("storage"));
    const print = jest.fn(async () => true);
    await expect(printManualKitchenChit("o1", REPRINT_AT, print, deps)).resolves.toBe(true);
    expect(print).toHaveBeenCalledWith({});
    expect(deps.release).not.toHaveBeenCalled();
  });
});

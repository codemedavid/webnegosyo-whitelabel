import { buildKitchenChitText } from "./kitchen-chit";
import { manualChitOptions } from "./kitchen-chit-reprint";

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

describe("manualChitOptions", () => {
  it("marks the chit when this device already printed one for the order", async () => {
    const claim = jest.fn(async () => []);
    await expect(manualChitOptions("o1", REPRINT_AT, claim)).resolves.toEqual({ reprintAt: REPRINT_AT });
    expect(claim).toHaveBeenCalledWith("kitchen", ["o1"]);
  });

  it("prints the first chit unmarked, and claims it so auto-print does not repeat it", async () => {
    const claim = jest.fn(async (_kind: string, ids: readonly string[]) => [...ids]);
    await expect(manualChitOptions("o1", REPRINT_AT, claim)).resolves.toEqual({});
  });

  it("prints unmarked when the device's history cannot be read", async () => {
    const claim = jest.fn(async () => {
      throw new Error("storage");
    });
    await expect(manualChitOptions("o1", REPRINT_AT, claim)).resolves.toEqual({});
  });
});

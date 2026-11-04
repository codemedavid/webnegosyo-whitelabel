/**
 * An automatic print (the kitchen/receipt watchers, the register's own chit)
 * claims the order in the printed ledger BEFORE paper moves. When the print
 * then FAILED, the claim used to stay, so the cashier's later manual print
 * said *** REPRINT *** on the only copy anyone got. `printClaimed` gives the
 * claim back on a failure, and only on a failure.
 */

const storage = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
  },
}));

import { printClaimed } from "./claimed-print";
import { claimPrinted, getPrintedLedger, resetPrintedLedgers } from "./printed-ledger";

beforeEach(() => {
  storage.clear();
  resetPrintedLedgers();
});

describe("printClaimed", () => {
  it("keeps the claim when paper came out", async () => {
    await claimPrinted("kitchen", ["o1"]);
    await expect(printClaimed("kitchen", "o1", async () => true)).resolves.toBe(true);
    expect(getPrintedLedger("kitchen")).toContain("o1");
  });

  it("gives the claim back when the printer refused, so the next print is a first print", async () => {
    await claimPrinted("kitchen", ["o1"]);
    await expect(printClaimed("kitchen", "o1", async () => false)).resolves.toBe(false);
    expect(getPrintedLedger("kitchen")).not.toContain("o1");
    // The manual retry now claims it fresh: no REPRINT stamp.
    expect(await claimPrinted("kitchen", ["o1"])).toEqual(["o1"]);
  });

  it("gives it back when the print threw, and never throws itself", async () => {
    await claimPrinted("receipt", ["o1"]);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      printClaimed("receipt", "o1", async () => {
        throw new Error("BLE gone");
      }),
    ).resolves.toBe(false);
    warn.mockRestore();
    expect(getPrintedLedger("receipt")).not.toContain("o1");
  });

  it("releases only the failed order, never another one's claim", async () => {
    await claimPrinted("kitchen", ["o1", "o2"]);
    await printClaimed("kitchen", "o1", async () => false);
    expect(getPrintedLedger("kitchen")).toEqual(["o2"]);
  });

  it("two watchers racing for one order: one prints, the loser never prints or releases", async () => {
    const [first, second] = await Promise.all([claimPrinted("kitchen", ["o1"]), claimPrinted("kitchen", ["o1"])]);
    expect([...first, ...second]).toEqual(["o1"]);
    const print = jest.fn(async () => true);
    for (const won of [first, second]) {
      for (const id of won) await printClaimed("kitchen", id, print);
    }
    expect(print).toHaveBeenCalledTimes(1);
    expect(getPrintedLedger("kitchen")).toContain("o1");
  });
});

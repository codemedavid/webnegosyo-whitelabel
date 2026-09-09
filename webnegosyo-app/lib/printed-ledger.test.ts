/**
 * One ledger per kind of paper, shared by every surface that auto-prints.
 * The register claims the kitchen chit the instant a counter sale is written;
 * the watcher, seeing the same order seconds later, must find it already
 * claimed. Two private copies of the list printed that chit twice.
 */

const storage = new Map<string, string>();
const mockGetItem = jest.fn(async (key: string) => storage.get(key) ?? null);
const mockSetItem = jest.fn(async (key: string, value: string) => {
  storage.set(key, value);
});

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => mockGetItem(key),
    setItem: (key: string, value: string) => mockSetItem(key, value),
  },
}));

import {
  claimPrinted,
  getPrintedLedger,
  hydratePrintedLedger,
  resetPrintedLedgers,
} from "./printed-ledger";

beforeEach(() => {
  storage.clear();
  mockGetItem.mockClear();
  mockSetItem.mockClear();
  resetPrintedLedgers();
});

describe("claimPrinted", () => {
  it("hands back only the ids nobody has printed yet, and remembers them", async () => {
    expect(await claimPrinted("kitchen", ["o1", "o2"])).toEqual(["o1", "o2"]);
    expect(await claimPrinted("kitchen", ["o2", "o3"])).toEqual(["o3"]);
    expect(getPrintedLedger("kitchen")).toEqual(["o1", "o2", "o3"]);
  });

  it("persists under the same key the watchers always used", async () => {
    await claimPrinted("kitchen", ["o1"]);
    await claimPrinted("receipt", ["o9"]);
    expect(storage.get("kitchen_printed_orders")).toBe(JSON.stringify(["o1"]));
    expect(storage.get("receipt_printed_orders")).toBe(JSON.stringify(["o9"]));
  });

  it("refuses an order a previous session already printed", async () => {
    storage.set("kitchen_printed_orders", JSON.stringify(["old"]));
    expect(await claimPrinted("kitchen", ["old", "new"])).toEqual(["new"]);
  });

  it("keeps the two kinds of paper apart", async () => {
    await claimPrinted("kitchen", ["o1"]);
    expect(await claimPrinted("receipt", ["o1"])).toEqual(["o1"]);
  });

  it("serialises two surfaces racing for the same order — exactly one wins", async () => {
    const [fromRegister, fromWatcher] = await Promise.all([
      claimPrinted("kitchen", ["o1"]),
      claimPrinted("kitchen", ["o1"]),
    ]);
    expect([...fromRegister, ...fromWatcher]).toEqual(["o1"]);
  });
});

describe("hydratePrintedLedger", () => {
  it("reads storage once and shares the answer", async () => {
    storage.set("receipt_printed_orders", JSON.stringify(["a"]));
    await Promise.all([hydratePrintedLedger("receipt"), hydratePrintedLedger("receipt")]);
    await hydratePrintedLedger("receipt");
    expect(mockGetItem).toHaveBeenCalledTimes(1);
    expect(getPrintedLedger("receipt")).toEqual(["a"]);
  });

  it("treats a failed or corrupt read as an empty history", async () => {
    mockGetItem.mockRejectedValueOnce(new Error("disk"));
    expect(await hydratePrintedLedger("kitchen")).toEqual([]);
    resetPrintedLedgers();
    storage.set("kitchen_printed_orders", "{not json");
    expect(await hydratePrintedLedger("kitchen")).toEqual([]);
  });

  it("is null before storage answers", () => {
    expect(getPrintedLedger("kitchen")).toBeNull();
  });
});

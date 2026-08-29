/**
 * Kitchen auto-print decisions. The chit should come out the moment a NEW
 * ticket lands on the board — and only then:
 *
 *  - scanNewTickets already excludes the first answered snapshot, so tickets
 *    that were on the board when the device opened never auto-print;
 *  - the persisted printed-list guards the remount gap (navigating away and
 *    back resets the in-memory seen-set, which would re-report live tickets
 *    as new and double-print them);
 *  - demo mode and printer-less devices stay silent whatever the toggle says.
 */

import {
  selectTicketsToAutoPrint,
  recordPrinted,
  parsePrintedList,
  serializePrintedList,
  PRINTED_LIST_CAP,
} from "./kitchen-autoprint";

const baseInput = {
  newIds: ["o1", "o2"] as readonly string[],
  printedList: [] as readonly string[],
  enabled: true,
  hasKitchenPrinter: true,
  isDemo: false,
};

describe("selectTicketsToAutoPrint", () => {
  it("prints every genuinely new ticket when armed", () => {
    expect(selectTicketsToAutoPrint(baseInput)).toEqual(["o1", "o2"]);
  });

  it("stays silent when the toggle is off", () => {
    expect(selectTicketsToAutoPrint({ ...baseInput, enabled: false })).toEqual([]);
  });

  it("stays silent without a kitchen-role printer", () => {
    expect(selectTicketsToAutoPrint({ ...baseInput, hasKitchenPrinter: false })).toEqual([]);
  });

  it("stays silent in demo mode — the demo must never move paper", () => {
    expect(selectTicketsToAutoPrint({ ...baseInput, isDemo: true })).toEqual([]);
  });

  it("never reprints a ticket already on the printed list", () => {
    expect(
      selectTicketsToAutoPrint({ ...baseInput, printedList: ["o1"] }),
    ).toEqual(["o2"]);
  });
});

describe("recordPrinted", () => {
  it("appends new ids without mutating and without duplicating", () => {
    const list = ["a"];
    const next = recordPrinted(list, ["b", "a"]);

    expect(next).toEqual(["a", "b"]);
    expect(list).toEqual(["a"]);
  });

  it("caps the list FIFO so storage cannot grow forever", () => {
    const full = Array.from({ length: PRINTED_LIST_CAP }, (_, i) => `o${i}`);
    const next = recordPrinted(full, ["fresh"]);

    expect(next).toHaveLength(PRINTED_LIST_CAP);
    expect(next[next.length - 1]).toBe("fresh");
    expect(next).not.toContain("o0"); // the oldest fell off
  });
});

describe("printed-list persistence", () => {
  it("round-trips through storage", () => {
    const list = ["o1", "o2"];
    expect(parsePrintedList(serializePrintedList(list))).toEqual(list);
  });

  it("treats absent or corrupt storage as an empty history", () => {
    expect(parsePrintedList(null)).toEqual([]);
    expect(parsePrintedList("{broken")).toEqual([]);
    expect(parsePrintedList(JSON.stringify({ nope: 1 }))).toEqual([]);
    expect(parsePrintedList(JSON.stringify(["ok", 42]))).toEqual(["ok"]);
  });
});

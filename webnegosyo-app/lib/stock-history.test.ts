/**
 * One ingredient's ledger as a timeline the merchant can read.
 *
 * Wording mirrors the web's stock history list
 * (src/components/admin/stock-history-list.tsx) so the two surfaces describe
 * the same row the same way.
 */

import {
  buildHistoryEntries,
  groupHistoryByDay,
  canShowRunningBalance,
  describeSince,
  formatEntryTime,
  lastReceivedAt,
  type MovementRow,
} from "./stock-history";

function row(overrides: Partial<MovementRow> = {}): MovementRow {
  return {
    id: "m1",
    reason: "receive",
    quantity_delta: 5,
    balance_after: 15,
    note: null,
    order_id: null,
    created_at: "2026-10-01T03:00:00.000Z",
    ...overrides,
  };
}

describe("buildHistoryEntries", () => {
  it("labels each reason and signs the delta", () => {
    const [received, sold, wasted] = buildHistoryEntries(
      [
        row({ id: "a", reason: "receive", quantity_delta: 5, balance_after: 15 }),
        row({ id: "b", reason: "sale", quantity_delta: -0.25, balance_after: 14.75 }),
        row({ id: "c", reason: "waste", quantity_delta: -1, balance_after: 13.75 }),
      ],
      "kg",
    );

    expect(received).toMatchObject({ label: "Received", delta: "+5 kg", tone: "in", balance: "15 kg" });
    expect(sold).toMatchObject({ label: "Sold", delta: "−0.25 kg", tone: "out" });
    expect(wasted).toMatchObject({ label: "Wasted", delta: "−1 kg", tone: "loss" });
  });

  it("calls a stocktake a count and treats it as neutral whichever way it moved", () => {
    const [entry] = buildHistoryEntries(
      [row({ reason: "stocktake", quantity_delta: -2, balance_after: 8 })],
      "kg",
    );
    expect(entry).toMatchObject({ label: "Counted", tone: "adjust", delta: "−2 kg" });
  });

  it("names transfers and voids", () => {
    const entries = buildHistoryEntries(
      [
        row({ id: "a", reason: "transfer_out", quantity_delta: -3 }),
        row({ id: "b", reason: "transfer_in", quantity_delta: 3 }),
        row({ id: "c", reason: "void", quantity_delta: 1 }),
      ],
      "kg",
    );
    expect(entries.map((e) => e.label)).toEqual(["Sent to branch", "Received from branch", "Order voided"]);
  });

  it("keeps an unknown reason readable rather than dropping the row", () => {
    const [entry] = buildHistoryEntries([row({ reason: "mystery_adjustment" })], "kg");
    expect(entry.label).toBe("Mystery adjustment");
  });

  it("carries the note, and marks order-driven rows", () => {
    const [entry] = buildHistoryEntries(
      [row({ reason: "sale", note: "  rush  ", order_id: "o1", quantity_delta: -1 })],
      "kg",
    );
    expect(entry.note).toBe("rush");
    expect(entry.fromOrder).toBe(true);
  });

  it("shows a zero-delta count without a sign", () => {
    const [entry] = buildHistoryEntries([row({ reason: "stocktake", quantity_delta: 0 })], "kg");
    expect(entry.delta).toBe("0 kg");
  });
});

describe("groupHistoryByDay", () => {
  it("groups newest day first using the store's local day", () => {
    // 2026-09-30T17:00Z is already Oct 1 in Manila (UTC+8).
    const entries = buildHistoryEntries(
      [
        row({ id: "a", created_at: "2026-10-01T05:00:00.000Z" }),
        row({ id: "b", created_at: "2026-09-30T17:00:00.000Z" }),
        row({ id: "c", created_at: "2026-09-30T10:00:00.000Z" }),
      ],
      "kg",
    );
    const groups = groupHistoryByDay(entries, {
      now: new Date("2026-10-01T06:00:00.000Z"),
      utcOffsetMinutes: 480,
    });

    expect(groups.map((g) => g.title)).toEqual(["Today", "Yesterday"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(groups[1].entries.map((e) => e.id)).toEqual(["c"]);
  });

  it("dates older days", () => {
    const entries = buildHistoryEntries([row({ created_at: "2026-09-20T05:00:00.000Z" })], "kg");
    const [group] = groupHistoryByDay(entries, {
      now: new Date("2026-10-01T06:00:00.000Z"),
      utcOffsetMinutes: 480,
    });
    expect(group.title).toBe("Sep 20");
  });
});

describe("lastReceivedAt", () => {
  it("is the newest receive or transfer in", () => {
    expect(
      lastReceivedAt([
        row({ reason: "sale", created_at: "2026-10-01T00:00:00.000Z" }),
        row({ reason: "receive", created_at: "2026-09-28T00:00:00.000Z" }),
        row({ reason: "transfer_in", created_at: "2026-09-29T00:00:00.000Z" }),
      ]),
    ).toBe("2026-09-29T00:00:00.000Z");
  });

  it("is null when nothing was ever received", () => {
    expect(lastReceivedAt([row({ reason: "sale" })])).toBeNull();
  });
});

describe("canShowRunningBalance", () => {
  it("shows it on a single branch's shelf", () => {
    expect(canShowRunningBalance([row({ outlet_id: "north" })], "north")).toBe(true);
  });

  it("shows it store-wide when no row belongs to a branch", () => {
    expect(canShowRunningBalance([row({ outlet_id: null }), row({})], undefined)).toBe(true);
  });

  it("hides it store-wide once branches are mixed in", () => {
    // balance_after is each BRANCH's running total, so interleaving North and
    // South rows would show a total that jumps between two shelves.
    expect(canShowRunningBalance([row({ outlet_id: "north" }), row({ outlet_id: null })], undefined)).toBe(
      false,
    );
  });
});

describe("describeSince", () => {
  const context = { now: new Date("2026-10-01T06:00:00.000Z"), utcOffsetMinutes: 480 };

  it("says today, yesterday, then days ago within a week", () => {
    expect(describeSince("2026-10-01T01:00:00.000Z", context)).toBe("Today");
    expect(describeSince("2026-09-30T05:00:00.000Z", context)).toBe("Yesterday");
    expect(describeSince("2026-09-27T05:00:00.000Z", context)).toBe("4 days ago");
  });

  it("dates anything older", () => {
    expect(describeSince("2026-09-01T05:00:00.000Z", context)).toBe("Sep 1");
  });

  it("says never for no date", () => {
    expect(describeSince(null, context)).toBe("Never");
  });
});

describe("formatEntryTime", () => {
  it("shows the store's local clock time", () => {
    expect(formatEntryTime("2026-10-01T05:07:00.000Z", 480)).toBe("1:07 PM");
    expect(formatEntryTime("2026-09-30T16:30:00.000Z", 480)).toBe("12:30 AM");
  });
});

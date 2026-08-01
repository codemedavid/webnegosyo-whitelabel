/**
 * What the phone shows about stock on the move.
 *
 * The merchant app's transfer screen exists for one moment above all others:
 * somebody at a receiving bench with a box in front of them. Everything here is
 * ordered around that — what needs counting in comes first, and a load already
 * received is history.
 *
 * Pure, so it runs under the app's Jest (which only picks up lib/ and theme/)
 * and so the phone and the web admin can be made to word the same thing the
 * same way.
 */

import {
  TRANSFER_STATUS_LABELS,
  describeTransferDirection,
  isAwaitingCount,
  isAwaitingDispatch,
  sortTransfersForBench,
  type TransferSummary,
} from "./inventory-transfers";

const BRANCHES = { north: "North", south: "South" };

function transfer(overrides: Partial<TransferSummary> = {}): TransferSummary {
  return {
    id: "tr1",
    status: "sent",
    fromOutletId: "north",
    toOutletId: "south",
    lineCount: 2,
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("naming the direction", () => {
  it("reads source to destination", () => {
    expect(describeTransferDirection(transfer(), BRANCHES)).toBe("North → South");
  });

  it("names the store pool rather than leaving a blank end", () => {
    // Every single-shop tenant's stock lives at `null`. A dangling arrow with
    // nothing on one side reads as a bug, not as the store.
    expect(
      describeTransferDirection(transfer({ fromOutletId: null }), BRANCHES),
    ).toBe("Store → South");
  });

  it("falls back to a neutral word for a branch it cannot name", () => {
    // A branch the reader has no RLS reach to, or one deleted since. Losing the
    // name must not lose the direction.
    expect(
      describeTransferDirection(transfer({ toOutletId: "unknown-id" }), BRANCHES),
    ).toBe("North → Another branch");
  });
});

describe("what still needs counting in", () => {
  it("treats a sent transfer as awaiting a count", () => {
    expect(isAwaitingCount(transfer({ status: "sent" }))).toBe(true);
  });

  it("treats a draft as not yet on its way", () => {
    // A draft has moved nothing. Showing it as awaiting a count would send
    // somebody to look for a box that was never loaded.
    expect(isAwaitingCount(transfer({ status: "draft" }))).toBe(false);
  });

  it("treats a received transfer as done", () => {
    expect(isAwaitingCount(transfer({ status: "received" }))).toBe(false);
  });
});

describe("the order the bench wants", () => {
  it("puts what needs counting in above everything else", () => {
    const ordered = sortTransfersForBench([
      transfer({ id: "done", status: "received" }),
      transfer({ id: "draft", status: "draft" }),
      transfer({ id: "arriving", status: "sent" }),
    ]);

    expect(ordered[0].id).toBe("arriving");
  });

  it("puts the longest-waiting consignment first", () => {
    // Oldest first among equals: a box that has been sitting since morning is
    // the one somebody has stopped chasing.
    const ordered = sortTransfersForBench([
      transfer({ id: "newer", createdAt: "2026-08-01T15:00:00.000Z" }),
      transfer({ id: "older", createdAt: "2026-08-01T09:00:00.000Z" }),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["older", "newer"]);
  });

  it("does not disturb the caller's array", () => {
    const input = [transfer({ id: "a", status: "received" }), transfer({ id: "b" })];
    sortTransfersForBench(input);

    expect(input.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("a draft nobody has loaded yet", () => {
  it("is awaiting dispatch", () => {
    expect(isAwaitingDispatch(transfer({ status: "draft" }))).toBe(true);
  });

  it("is not a consignment on its way", () => {
    // The two states drive different buttons on the same row, and offering
    // "Send" for something already on a van would double-deplete the sender.
    expect(isAwaitingDispatch(transfer({ status: "sent" }))).toBe(false);
    expect(isAwaitingCount(transfer({ status: "draft" }))).toBe(false);
  });

  it("is not history", () => {
    expect(isAwaitingDispatch(transfer({ status: "received" }))).toBe(false);
    expect(isAwaitingDispatch(transfer({ status: "cancelled" }))).toBe(false);
  });
});

describe("the order a bench wants", () => {
  it("puts a draft above finished work but below a box waiting to be counted", () => {
    // A stranded draft — composed on a phone whose send failed — is real work
    // somebody has to finish, so it must not sink under a week of history. It
    // still ranks below an actual box: nobody is standing over a draft.
    const ordered = sortTransfersForBench([
      transfer({ id: "done", status: "received", createdAt: "2026-08-01T08:00:00.000Z" }),
      transfer({ id: "stranded", status: "draft", createdAt: "2026-08-01T09:00:00.000Z" }),
      transfer({ id: "arriving", status: "sent", createdAt: "2026-08-01T10:00:00.000Z" }),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["arriving", "stranded", "done"]);
  });
});

describe("status wording", () => {
  it("calls a sent transfer in transit rather than sent", () => {
    // "Sent" answers what the office did; "In transit" answers where the stock
    // is, which is the question somebody holding a clipboard is asking.
    expect(TRANSFER_STATUS_LABELS.sent).toBe("In transit");
  });
});

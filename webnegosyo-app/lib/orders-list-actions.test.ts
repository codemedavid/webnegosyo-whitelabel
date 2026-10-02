/**
 * Two decisions the Orders tab used to make implicitly, and got wrong:
 *
 * - A double-tap on "Mark as Confirmed" fired two mutations, two stock
 *   restores and two Loyverse pushes. The busy set makes the second tap a
 *   no-op until the first has settled.
 * - Export shared whatever page happened to be loaded, but always reported
 *   coverage against the deep 2000-row cap — so a 50-row fallback page
 *   claimed to cover the whole month.
 */
import {
  claimOrderBusy,
  releaseOrderBusy,
  resolveExportSource,
  resolveListAdvance,
} from "./orders-list-actions";

describe("claimOrderBusy", () => {
  it("claims an idle order and returns a new set holding it", () => {
    const busy: ReadonlySet<string> = new Set();

    const claim = claimOrderBusy(busy, "o1");

    expect(claim.isClaimed).toBe(true);
    expect([...claim.busy]).toEqual(["o1"]);
    expect(busy.size).toBe(0);
  });

  it("refuses a second claim while the order is still busy", () => {
    const first = claimOrderBusy(new Set(), "o1");

    const second = claimOrderBusy(first.busy, "o1");

    expect(second.isClaimed).toBe(false);
    expect(second.busy).toBe(first.busy);
  });

  it("keeps other orders independent", () => {
    const first = claimOrderBusy(new Set(), "o1");

    const other = claimOrderBusy(first.busy, "o2");

    expect(other.isClaimed).toBe(true);
    expect([...other.busy].sort()).toEqual(["o1", "o2"]);
  });
});

describe("releaseOrderBusy", () => {
  it("frees the order without mutating the previous set", () => {
    const claimed = claimOrderBusy(new Set(), "o1").busy;

    const released = releaseOrderBusy(claimed, "o1");

    expect(released.has("o1")).toBe(false);
    expect(claimed.has("o1")).toBe(true);
    expect(claimOrderBusy(released, "o1").isClaimed).toBe(true);
  });

  it("returns the same set when the order was not busy", () => {
    const busy: ReadonlySet<string> = new Set(["o2"]);
    expect(releaseOrderBusy(busy, "o1")).toBe(busy);
  });
});

describe("resolveExportSource", () => {
  const deep = [{ _id: "a" }, { _id: "b" }, { _id: "c" }];
  const queue = [{ _id: "a" }];

  it("uses the deep page with its own cap once it has landed", () => {
    const source = resolveExportSource(deep, queue, 2000);

    expect(source.orders).toBe(deep);
    expect(source.fetchLimit).toBe(2000);
    expect(source.isDeepRead).toBe(true);
  });

  it("falls back to the queue page and reports its coverage against the rows it actually holds", () => {
    const source = resolveExportSource(undefined, queue, 2000);

    expect(source.orders).toBe(queue);
    // Not the deep cap: a one-row page would otherwise claim a full month.
    expect(source.fetchLimit).toBe(1);
    expect(source.isDeepRead).toBe(false);
  });

  it("exports nothing, honestly, when neither page has landed", () => {
    const source = resolveExportSource(undefined, undefined, 2000);

    expect(source.orders).toEqual([]);
    expect(source.fetchLimit).toBe(0);
    expect(source.isDeepRead).toBe(false);
  });

  it("treats an empty deep page as landed", () => {
    const source = resolveExportSource([], queue, 2000);

    expect(source.orders).toEqual([]);
    expect(source.isDeepRead).toBe(true);
  });
});

/**
 * A quick "Confirm" or "Delivered" on an unpaid order is not a one-tap status
 * change: the merchant must say whether the money came in. The list holds no
 * ledger and no collect sheet, so it opens the order screen with the question
 * already asked.
 */
describe("resolveListAdvance", () => {
  const unpaid = { status: "pending", paymentStatus: "pending", total: 450, customerData: {} };

  it("opens the order to ask about payment before confirming an unpaid order", () => {
    expect(resolveListAdvance(unpaid, "confirmed")).toEqual({ kind: "open", intent: "confirm" });
  });

  it("opens the order to collect before handing over an unpaid one", () => {
    expect(resolveListAdvance({ ...unpaid, status: "ready" }, "delivered")).toEqual({
      kind: "open",
      intent: "deliver",
    });
  });

  it("moves a paid order straight on", () => {
    expect(resolveListAdvance({ ...unpaid, paymentStatus: "paid" }, "confirmed")).toEqual({
      kind: "advance",
    });
  });

  it("moves an order straight on between the kitchen steps", () => {
    expect(resolveListAdvance({ ...unpaid, status: "confirmed" }, "preparing")).toEqual({
      kind: "advance",
    });
  });

  it("reads an order settled on the ledger as paid", () => {
    expect(resolveListAdvance({ ...unpaid, amountPaid: 450 }, "confirmed")).toEqual({ kind: "advance" });
  });
});

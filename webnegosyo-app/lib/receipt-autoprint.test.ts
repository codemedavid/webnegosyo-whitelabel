import {
  selectConfirmedOrderIds,
  selectOrdersToAutoPrint,
  RECEIPT_CONFIRMED_STATUSES,
} from "./receipt-autoprint";
import { scanNewTickets } from "./kitchen-tickets";

describe("selectConfirmedOrderIds", () => {
  it("returns undefined while the orders query has not answered", () => {
    // `undefined` must survive so the first-snapshot rule in scanNewTickets
    // still sees "loading", not "answered: nothing".
    expect(selectConfirmedOrderIds(undefined)).toBeUndefined();
  });

  it("keeps every post-confirmation status and drops pending and cancelled", () => {
    // Arrange
    const orders = [
      { _id: "p", status: "pending" },
      { _id: "c", status: "confirmed" },
      { _id: "pr", status: "preparing" },
      { _id: "r", status: "ready" },
      { _id: "d", status: "delivered" },
      { _id: "x", status: "cancelled" },
    ];

    // Act
    const ids = selectConfirmedOrderIds(orders);

    // Assert
    expect(ids).toEqual(["c", "pr", "r", "d"]);
    expect(RECEIPT_CONFIRMED_STATUSES).not.toContain("pending");
  });

  it("excludes counter sales — the tender screen already printed those", () => {
    const orders = [
      { _id: "web", status: "confirmed", source: "web" },
      { _id: "till", status: "confirmed", source: "pos" },
    ];
    expect(selectConfirmedOrderIds(orders)).toEqual(["web"]);
  });
});

describe("confirmation transitions through scanNewTickets", () => {
  it("prints nothing for orders already confirmed when the watcher mounted", () => {
    const first = scanNewTickets(null, selectConfirmedOrderIds([
      { _id: "old", status: "preparing" },
    ]));
    expect([...first.newIds]).toEqual([]);
  });

  it("reports an order the moment it moves from pending to confirmed", () => {
    // Arrange — snapshot 1: order still pending, so not in the set.
    const first = scanNewTickets(null, selectConfirmedOrderIds([
      { _id: "a", status: "pending" },
    ]));

    // Act — snapshot 2: someone (any screen, or the web admin) confirmed it.
    const second = scanNewTickets(first.seen, selectConfirmedOrderIds([
      { _id: "a", status: "confirmed" },
    ]));

    // Assert
    expect([...second.newIds]).toEqual(["a"]);
  });

  it("does not report the same order again as it moves on to preparing", () => {
    const s1 = scanNewTickets(null, selectConfirmedOrderIds([{ _id: "a", status: "pending" }]));
    const s2 = scanNewTickets(s1.seen, selectConfirmedOrderIds([{ _id: "a", status: "confirmed" }]));
    const s3 = scanNewTickets(s2.seen, selectConfirmedOrderIds([{ _id: "a", status: "preparing" }]));
    expect([...s3.newIds]).toEqual([]);
  });
});

describe("selectOrdersToAutoPrint", () => {
  const base = {
    newIds: ["a", "b"],
    printedList: ["a"],
    printsOnConfirmation: true,
    hasCashierPrinter: true,
    isDemo: false,
  };

  it("prints only the new ids this device has not printed before", () => {
    expect(selectOrdersToAutoPrint(base)).toEqual(["b"]);
  });

  it("prints nothing when the trigger does not fire on confirmation", () => {
    expect(selectOrdersToAutoPrint({ ...base, printsOnConfirmation: false })).toEqual([]);
  });

  it("prints nothing without a cashier-role printer", () => {
    expect(selectOrdersToAutoPrint({ ...base, hasCashierPrinter: false })).toEqual([]);
  });

  it("never moves paper in demo mode", () => {
    expect(selectOrdersToAutoPrint({ ...base, isDemo: true })).toEqual([]);
  });
});

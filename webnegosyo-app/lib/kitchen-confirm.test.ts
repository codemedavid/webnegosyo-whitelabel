import {
  EMPTY_RING_TRACKER,
  KITCHEN_CONFIRMED_STATUS,
  confirmWritePlan,
  detectKitchenConfirmations,
  formatKitchenConfirmation,
  kitchenTicketStatus,
  ringingIdsKey,
  shouldShowKitchenConfirmations,
  withRinging,
  withoutRinging,
  trackRinging,
  type RingTracker,
} from "./kitchen-confirm";
import {
  confirmedOnThisDevice,
  forgetConfirmedOnThisDevice,
  rememberConfirmedHere,
  resetConfirmedHereForTests,
} from "./kitchen-confirm-local";

const T0 = new Date("2026-10-29T12:00:00+08:00").getTime();

function ticket(id: string, status = "confirmed") {
  return { id, status };
}

function track(...snapshots: (ReturnType<typeof ticket>[] | undefined)[]): RingTracker {
  return snapshots.reduce<RingTracker>(
    (tracker, snapshot, index) => trackRinging(tracker, snapshot, T0 + index * 1_000),
    EMPTY_RING_TRACKER,
  );
}

describe("trackRinging — which tickets ring on the board", () => {
  it("does not ring for tickets already on the board when it opens", () => {
    // A store with months-old confirmed orders would otherwise ring forever
    // the moment someone opened the Kitchen screen.
    const tracker = track([ticket("old-1"), ticket("old-2")]);
    expect(tracker.ringing.size).toBe(0);
  });

  it("keeps its seen-set while the query is still loading", () => {
    // `undefined` = not answered yet. Treating it as an empty board would make
    // the first real snapshot look brand new and ring every ticket on it.
    const tracker = track(undefined, [ticket("old-1")], [ticket("old-1"), ticket("new-1")]);
    expect([...tracker.ringing.keys()]).toEqual(["new-1"]);
  });

  it("rings for a confirmed ticket that lands after the board opened", () => {
    const tracker = track([ticket("old-1")], [ticket("old-1"), ticket("new-1")]);
    expect([...tracker.ringing.keys()]).toEqual(["new-1"]);
    expect(tracker.ringing.get("new-1")).toBe(T0 + 1_000);
  });

  it("keeps ringing across polls and remembers when it first rang", () => {
    const tracker = track([], [ticket("new-1")], [ticket("new-1")], [ticket("new-1")]);
    expect(tracker.ringing.get("new-1")).toBe(T0 + 1_000);
  });

  it("stops ringing once the kitchen confirms (the ticket moves to preparing)", () => {
    const tracker = track([], [ticket("new-1")], [ticket("new-1", "preparing")]);
    expect(tracker.ringing.size).toBe(0);
  });

  it("stops ringing when the ticket leaves the board (bumped, cancelled)", () => {
    const tracker = track([], [ticket("new-1")], []);
    expect(tracker.ringing.size).toBe(0);
  });

  it("does not ring for a new ticket that is already being prepared", () => {
    // Confirmed on another kitchen display before this one saw it.
    const tracker = track([], [ticket("new-1", "preparing")]);
    expect(tracker.ringing.size).toBe(0);
  });

  it("does not mutate the tracker it was given", () => {
    const first = track([]);
    const before = first.ringing.size;
    trackRinging(first, [ticket("new-1")], T0);
    expect(first.ringing.size).toBe(before);
  });
});

describe("ringingIdsKey", () => {
  it("is stable whatever order the tickets rang in", () => {
    const a = track([], [ticket("b"), ticket("a")]);
    const b = track([], [ticket("a"), ticket("b")]);
    expect(ringingIdsKey(a)).toBe(ringingIdsKey(b));
  });

  it("is empty when nothing rings", () => {
    expect(ringingIdsKey(EMPTY_RING_TRACKER)).toBe("");
  });
});

describe("kitchenTicketStatus", () => {
  it("reads ringing for a new, unconfirmed ticket", () => {
    expect(kitchenTicketStatus("confirmed", true)).toBe("ringing");
  });

  it("reads waiting for an unconfirmed ticket that was already on the board", () => {
    expect(kitchenTicketStatus("confirmed", false)).toBe("waiting");
  });

  it("reads confirmed once the kitchen has it", () => {
    expect(kitchenTicketStatus("preparing", false)).toBe("confirmed");
    expect(kitchenTicketStatus("preparing", true)).toBe("confirmed");
  });
});

describe("confirmWritePlan", () => {
  it("moves a confirmed order to preparing", () => {
    expect(confirmWritePlan("confirmed")).toEqual({ shouldWrite: true, status: KITCHEN_CONFIRMED_STATUS });
  });

  it("writes nothing when another display already confirmed it", () => {
    // Writing `preparing` over `ready` would pull a finished plate back.
    expect(confirmWritePlan("preparing")).toEqual({ shouldWrite: false });
    expect(confirmWritePlan("ready")).toEqual({ shouldWrite: false });
  });

  it("writes nothing when the status is unknown", () => {
    expect(confirmWritePlan(undefined)).toEqual({ shouldWrite: false });
  });
});

describe("detectKitchenConfirmations — what the cashier hears about", () => {
  const queueOrder = (id: string, status: string) => ({ _id: id, status, customerName: "Maria" });

  it("says nothing on the first snapshot", () => {
    const result = detectKitchenConfirmations(null, [queueOrder("a", "preparing")], new Set());
    expect(result.confirmed).toEqual([]);
    expect(result.statuses?.get("a")).toBe("preparing");
  });

  it("keeps what it knew while the queue is loading", () => {
    const first = detectKitchenConfirmations(null, [queueOrder("a", "confirmed")], new Set());
    const loading = detectKitchenConfirmations(first.statuses, undefined, new Set());
    expect(loading.statuses).toBe(first.statuses);
    expect(loading.confirmed).toEqual([]);
  });

  it("reports an order the kitchen moved from confirmed to preparing", () => {
    const first = detectKitchenConfirmations(null, [queueOrder("a", "confirmed")], new Set());
    const next = detectKitchenConfirmations(first.statuses, [queueOrder("a", "preparing")], new Set());
    expect(next.confirmed.map((order) => order._id)).toEqual(["a"]);
  });

  it("reports an order bumped straight to ready between two polls", () => {
    const first = detectKitchenConfirmations(null, [queueOrder("a", "confirmed")], new Set());
    const next = detectKitchenConfirmations(first.statuses, [queueOrder("a", "ready")], new Set());
    expect(next.confirmed.map((order) => order._id)).toEqual(["a"]);
  });

  it("reports each confirmation once", () => {
    const first = detectKitchenConfirmations(null, [queueOrder("a", "confirmed")], new Set());
    const second = detectKitchenConfirmations(first.statuses, [queueOrder("a", "preparing")], new Set());
    const third = detectKitchenConfirmations(second.statuses, [queueOrder("a", "preparing")], new Set());
    expect(third.confirmed).toEqual([]);
  });

  it("ignores orders that were never waiting on the kitchen", () => {
    const first = detectKitchenConfirmations(null, [queueOrder("a", "pending")], new Set());
    const next = detectKitchenConfirmations(first.statuses, [queueOrder("a", "preparing")], new Set());
    expect(next.confirmed).toEqual([]);
  });

  it("ignores the device's own taps", () => {
    const first = detectKitchenConfirmations(null, [queueOrder("a", "confirmed")], new Set());
    const next = detectKitchenConfirmations(first.statuses, [queueOrder("a", "preparing")], new Set(["a"]));
    expect(next.confirmed).toEqual([]);
  });

  it("reads an order seen in two buckets at its later status", () => {
    // A status change between two reads of a polled backend can list the same
    // row as both confirmed and preparing.
    const first = detectKitchenConfirmations(null, [queueOrder("a", "confirmed")], new Set());
    const next = detectKitchenConfirmations(
      first.statuses,
      [queueOrder("a", "confirmed"), queueOrder("a", "preparing")],
      new Set(),
    );
    expect(next.confirmed.map((order) => order._id)).toEqual(["a"]);
    expect(next.statuses?.get("a")).toBe("preparing");
  });
});

describe("formatKitchenConfirmation", () => {
  it("names the order the way the cashier's list does, with the guest and table", () => {
    expect(
      formatKitchenConfirmation({
        _id: "abcd1234",
        status: "preparing",
        dailyNumber: 7,
        customerName: "Maria",
        customerData: { table_number: "4" },
      }),
    ).toEqual({ title: "Kitchen confirmed #07", body: "Maria · Table 4" });
  });

  it("calls a nameless order Guest", () => {
    expect(formatKitchenConfirmation({ _id: "abcd1234", status: "preparing", customerName: "" }).body).toBe(
      "Guest",
    );
  });
});

describe("shouldShowKitchenConfirmations — who hears it", () => {
  const live = { convexUrl: null, orderBackend: "platform", isDemo: false } as const;

  it("tells cashiers", () => {
    expect(
      shouldShowKitchenConfirmations({ ...live, caller: { role: "admin", isOwner: false, permissions: ["pos"] } }),
    ).toBe(true);
  });

  it("tells owners", () => {
    expect(
      shouldShowKitchenConfirmations({ ...live, caller: { role: "admin", isOwner: true, permissions: [] } }),
    ).toBe(true);
  });

  it("does not tell kitchen-only staff about their own work", () => {
    expect(
      shouldShowKitchenConfirmations({ ...live, caller: { role: "admin", isOwner: false, permissions: ["kitchen"] } }),
    ).toBe(false);
  });

  it("stays silent in the demo", () => {
    expect(
      shouldShowKitchenConfirmations({
        ...live,
        isDemo: true,
        caller: { role: "admin", isOwner: true, permissions: [] },
      }),
    ).toBe(false);
  });
});

describe("confirmed-on-this-device registry", () => {
  afterEach(() => resetConfirmedHereForTests());

  it("remembers the orders this device confirmed", () => {
    rememberConfirmedHere("a");
    expect(confirmedOnThisDevice().has("a")).toBe(true);
  });

  it("is bounded, so a long shift cannot grow it forever", () => {
    for (let i = 0; i < 1_000; i++) rememberConfirmedHere(`id-${i}`);
    expect(confirmedOnThisDevice().size).toBeLessThanOrEqual(200);
    expect(confirmedOnThisDevice().has("id-999")).toBe(true);
    expect(confirmedOnThisDevice().has("id-0")).toBe(false);
  });

  it("hands out a snapshot, not the live set", () => {
    const before = confirmedOnThisDevice();
    rememberConfirmedHere("b");
    expect(before.has("b")).toBe(false);
  });
});

describe("withoutRinging / withRinging — a failed Confirm rings again", () => {
  const ringing = { seen: new Set(["a", "b"]), ringing: new Map([["a", T0]]) };

  it("stops one ticket and keeps the rest of the tracker", () => {
    const stopped = withoutRinging(ringing, "a");
    expect(stopped.ringing.has("a")).toBe(false);
    expect(stopped.seen).toBe(ringing.seen);
  });

  it("puts a ticket back with the time it first rang", () => {
    const restored = withRinging(withoutRinging(ringing, "a"), "a", T0);
    expect(restored.ringing.get("a")).toBe(T0);
  });

  it("leaves a ticket that is still ringing alone", () => {
    expect(withRinging(ringing, "a", T0 + 5)).toBe(ringing);
  });

  it("never rings a ticket the board no longer shows", () => {
    expect(withRinging(ringing, "gone", T0).ringing.has("gone")).toBe(false);
  });
});

describe("forgetConfirmedOnThisDevice", () => {
  afterEach(() => resetConfirmedHereForTests());

  it("drops a tap whose write failed, so another display's Confirm is still announced", () => {
    rememberConfirmedHere("a");
    forgetConfirmedOnThisDevice("a");
    expect(confirmedOnThisDevice().has("a")).toBe(false);
  });
});

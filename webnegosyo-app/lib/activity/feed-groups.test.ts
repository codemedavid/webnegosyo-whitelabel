import { buildFeedItems, daySummary, routineFamilyOf } from "./feed-groups";
import { activityEvent } from "./test-fixtures";

// 2026-10-12 12:41 PM in Manila.
const NOW = "2026-10-12T04:41:00.000Z";
const TODAY_NOON = "2026-10-12T04:00:00.000Z";
const TODAY_MORNING = "2026-10-12T01:00:00.000Z";
const YESTERDAY = "2026-10-11T05:00:00.000Z";

describe("daySummary", () => {
  it("leads with money out, cancels and the drawer", () => {
    const events = [
      activityEvent("refund.issued", { amount: -185 }),
      activityEvent("order.cancelled", { amount: 310 }),
      activityEvent("shift.closed", { amount: -100 }),
    ];
    expect(daySummary(events)).toEqual({ summary: "₱185 refunded · 1 cancel · drawer −₱100", isAllClear: false });
  });

  it("pluralises and adds what still needs a look", () => {
    const events = [
      activityEvent("order.cancelled", { flags: ["repeat_cancels"] }),
      activityEvent("order.cancelled"),
    ];
    expect(daySummary(events).summary).toBe("2 cancels · 1 to check");
  });

  it("says a day with nothing to worry about is clear", () => {
    const events = [activityEvent("stock.received"), activityEvent("shift.closed", { amount: 0 })];
    expect(daySummary(events)).toEqual({ summary: "Nothing to check", isAllClear: true });
  });

  it("does not count a flag that was already reviewed", () => {
    const events = [activityEvent("stock.counted", { flags: ["count_variance"], reviewedAt: NOW })];
    expect(daySummary(events).isAllClear).toBe(true);
  });
});

describe("routineFamilyOf", () => {
  it("puts routine kinds into four families and nothing else into any", () => {
    expect(routineFamilyOf("order.placed")).toBe("orders");
    expect(routineFamilyOf("order.completed")).toBe("orders");
    expect(routineFamilyOf("payment.charged")).toBe("payments");
    expect(routineFamilyOf("stock.sale")).toBe("stock");
    expect(routineFamilyOf("loyalty.stamps_earned")).toBe("loyalty");
    expect(routineFamilyOf("refund.issued")).toBeNull();
  });
});

describe("buildFeedItems", () => {
  it("puts a header before each Manila day, newest first", () => {
    const items = buildFeedItems(
      [
        activityEvent("refund.issued", { id: "r1", occurredAt: TODAY_NOON, amount: -185 }),
        activityEvent("stock.received", { id: "s1", occurredAt: YESTERDAY }),
      ],
      { nowIso: NOW, expanded: new Set() },
    );
    expect(items.map((item) => (item.type === "day" ? `day:${item.label}` : `${item.type}:${item.key}`))).toEqual([
      "day:Today",
      "event:r1",
      "day:Yesterday",
      "event:s1",
    ]);
  });

  it("folds a day's routine events into one roll-up per family, where the newest one was", () => {
    const items = buildFeedItems(
      [
        activityEvent("stock.sale", { occurredAt: TODAY_NOON, summary: { lines: [{ name: "Rice", quantity: -0.2 }] }, subjectRef: "o1" }),
        activityEvent("refund.issued", { id: "r1", occurredAt: "2026-10-12T03:00:00.000Z" }),
        activityEvent("stock.sale", {
          occurredAt: TODAY_MORNING,
          summary: { lines: [{ name: "Rice", quantity: -0.3 }, { name: "Pork", quantity: -0.1 }] },
          subjectRef: "o2",
        }),
        activityEvent("stock.restored", { occurredAt: TODAY_MORNING, quantity: 1, unit: "kg", summary: { itemName: "Pork" }, subjectRef: "o2" }),
      ],
      { nowIso: NOW, expanded: new Set() },
    );
    expect(items.map((item) => item.type)).toEqual(["day", "rollup", "event"]);
    const rollup = items[1];
    if (rollup.type !== "rollup") throw new Error("expected a roll-up");
    expect(rollup.count).toBe(3);
    expect(rollup.title).toBe("Stock used by 2 orders");
    expect(rollup.lines).toEqual(["Rice 0.5 · Pork 0.1 · Pork 1 kg"]);
    expect(rollup.isExpanded).toBe(false);
  });

  it("names the extra items instead of listing them all", () => {
    const names = ["Rice", "Pork", "Egg", "Oil", "Salt"];
    const events = names.map((name) =>
      activityEvent("stock.sale", { occurredAt: TODAY_NOON, quantity: -1, unit: "pc", summary: { itemName: name }, subjectRef: "o1" }),
    );
    const [, rollup] = buildFeedItems(events, { nowIso: NOW, expanded: new Set() });
    if (rollup.type !== "rollup") throw new Error("expected a roll-up");
    expect(rollup.lines).toEqual(["Rice 1 pc · Pork 1 pc · Egg 1 pc · 2 more"]);
  });

  it("marks a roll-up expanded by its key", () => {
    const events = [activityEvent("order.placed", { occurredAt: TODAY_NOON })];
    const [, first] = buildFeedItems(events, { nowIso: NOW, expanded: new Set() });
    if (first.type !== "rollup") throw new Error("expected a roll-up");
    const [, again] = buildFeedItems(events, { nowIso: NOW, expanded: new Set([first.key]) });
    expect(again.type === "rollup" && again.isExpanded).toBe(true);
    expect(first.title).toBe("1 order placed or moved");
  });

  it("summarises payments with their total", () => {
    const events = [
      activityEvent("payment.charged", { occurredAt: TODAY_NOON, amount: 480 }),
      activityEvent("payment.charged", { occurredAt: TODAY_MORNING, amount: 120 }),
    ];
    const [, rollup] = buildFeedItems(events, { nowIso: NOW, expanded: new Set() });
    expect(rollup.type === "rollup" && rollup.title).toBe("2 payments taken");
    expect(rollup.type === "rollup" && rollup.lines).toEqual(["₱600 in"]);
  });

  it("returns nothing for no events", () => {
    expect(buildFeedItems([], { nowIso: NOW, expanded: new Set() })).toEqual([]);
  });
});

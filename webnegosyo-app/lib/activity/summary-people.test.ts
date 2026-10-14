import { buildPeopleRows, MIN_SHIFTS_FOR_NORMAL } from "./summary-people";
import type { StoreActivityActorTotal, StoreActivitySummary } from "./store-event";

function summary(byActor: StoreActivityActorTotal[]): StoreActivitySummary {
  return { byKind: [], byActor, byDay: [], routine: [], flaggedOpen: 0 };
}

function actor(id: string, name: string, kind: StoreActivityActorTotal["kind"], count: number): StoreActivityActorTotal {
  return { actorUserId: id, actorName: name, kind, count, amount: null };
}

describe("buildPeopleRows", () => {
  const baseline = summary([
    actor("u-ana", "Ana Reyes", "shift.opened", 20),
    actor("u-ana", "Ana Reyes", "order.cancelled", 10),
    actor("u-ben", "Ben Cruz", "shift.opened", 20),
    actor("u-ben", "Ben Cruz", "order.cancelled", 2),
  ]);

  it("compares each person only with their own normal, per shift worked", () => {
    const current = summary([
      actor("u-ana", "Ana Reyes", "shift.opened", 2),
      actor("u-ana", "Ana Reyes", "order.cancelled", 1),
      actor("u-ben", "Ben Cruz", "shift.opened", 2),
      actor("u-ben", "Ben Cruz", "order.cancelled", 3),
    ]);
    const rows = buildPeopleRows(current, baseline);
    // Ben is off his normal (0.1 cancels a shift, 3 in 2 shifts); Ana is not
    // (0.5 a shift, 1 in 2). Ben is listed first because he has something to
    // check — never because of a rank.
    expect(rows.map((row) => [row.name, row.status, row.line])).toEqual([
      ["Ben Cruz", "check", "3 cancels · usually 0–1"],
      ["Ana Reyes", "normal", "1 cancel · usually about 1"],
    ]);
  });

  it("says someone is new until they have worked enough shifts", () => {
    const thin = summary([actor("u-cy", "Cy Lim", "shift.opened", MIN_SHIFTS_FOR_NORMAL - 1)]);
    const current = summary([actor("u-cy", "Cy Lim", "refund.issued", 2)]);
    const [row] = buildPeopleRows(current, thin);
    expect(row.status).toBe("new");
    expect(row.line).toBe("2 refunds · New: no normal yet");
  });

  it("lists people with nothing to check alphabetically, with a plain line", () => {
    const current = summary([
      actor("u-zed", "Zed Uy", "shift.opened", 1),
      actor("u-amy", "Amy Go", "stock.received", 3),
    ]);
    const rows = buildPeopleRows(current, null);
    expect(rows.map((row) => [row.name, row.line, row.status])).toEqual([
      ["Amy Go", "Nothing to check", "normal"],
      ["Zed Uy", "Nothing to check", "normal"],
    ]);
  });

  it("leaves out the system and customers", () => {
    const current = summary([{ actorUserId: null, actorName: null, kind: "order.cancelled", count: 4, amount: null }]);
    expect(buildPeopleRows(current, baseline)).toEqual([]);
  });
});

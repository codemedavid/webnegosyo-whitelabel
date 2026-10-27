import { drawerSplitText, historyPayoutText } from "./money-glance-drawer";
import { summarizeShiftPayouts } from "./drawer-expenses";
import type { MovementLink } from "./expense-service";

function link(categoryId: string, categoryName: string, group: MovementLink["group"], status: MovementLink["status"] = "recorded"): MovementLink {
  return { expenseId: `x-${categoryId}`, categoryId, categoryName, group, status };
}

const payouts = [
  { id: "m1", kind: "pay_out" as const, amount: 1_180 },
  { id: "m2", kind: "pay_out" as const, amount: 300 },
  { id: "m3", kind: "pay_out" as const, amount: 1_000 },
];
const links = new Map<string, MovementLink>([
  ["m1", link("lpg", "Gas / LPG", "utilities")],
  ["m2", link("ice", "Ice (Yelo)", "ingredients")],
  ["m3", link("owner", "Owner took cash", "not_expense")],
]);

describe("drawerSplitText", () => {
  it("splits what left a drawer into expenses and cash taken out, pickups included", () => {
    expect(drawerSplitText(summarizeShiftPayouts(payouts, links), 500)).toBe("Expenses ₱1,480 · Taken out ₱1,500");
  });

  it("names only the parts that happened", () => {
    expect(drawerSplitText(summarizeShiftPayouts(payouts.slice(0, 2), links), 0)).toBe("Expenses ₱1,480");
    expect(drawerSplitText(summarizeShiftPayouts([], links), 2_000)).toBe("Taken out ₱2,000");
    expect(drawerSplitText(summarizeShiftPayouts([], links), 0)).toBeNull();
  });

  it("keeps pay-outs nobody gave a category apart", () => {
    const loose = [{ id: "z", kind: "pay_out" as const, amount: 85.5 }];
    expect(drawerSplitText(summarizeShiftPayouts(loose, new Map()), 0)).toBe("Paid out ₱85.50");
  });

  it("says only pickups while the expense split is not known yet", () => {
    expect(drawerSplitText(null, 250)).toBe("Taken out ₱250");
    expect(drawerSplitText(null, 0)).toBeNull();
  });
});

describe("historyPayoutText", () => {
  it("lists what a shift paid for by category, biggest first", () => {
    const moves = [
      { id: "m1", kind: "pay_out" as const, amount: 1_180, reason: "LPG 11kg" },
      { id: "m2", kind: "pay_out" as const, amount: 300, reason: "Ice (Yelo)" },
      { id: "m4", kind: "pay_out" as const, amount: 150, reason: "Ice (Yelo)" },
      { id: "m3", kind: "pay_out" as const, amount: 1_000, reason: "Owner took cash" },
    ];
    const all = new Map(links).set("m4", link("ice", "Ice (Yelo)", "ingredients"));

    expect(historyPayoutText(moves, all)).toBe("Paid for: Gas / LPG ₱1,180 · Ice (Yelo) ₱450 (2)");
  });

  it("names a pay-out with no category by its reason", () => {
    const moves = [
      { id: "m1", kind: "pay_out" as const, amount: 1_180, reason: "LPG" },
      { id: "q", kind: "pay_out" as const, amount: 85.5, reason: "Rider" },
      { id: "r", kind: "pay_out" as const, amount: 20, reason: null },
    ];

    expect(historyPayoutText(moves, links)).toBe("Paid for: Gas / LPG ₱1,180 · Rider ₱85.50 · No reason given ₱20");
  });

  it("says nothing for a shift that paid nothing out", () => {
    expect(historyPayoutText([{ id: "c", kind: "collect" as const, amount: 100, reason: null }], links)).toBeNull();
  });
});

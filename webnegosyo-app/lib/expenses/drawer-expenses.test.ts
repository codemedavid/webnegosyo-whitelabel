import { describeShiftExpenses, payoutLines, summarizeShiftPayouts } from "./drawer-expenses";

const moves = [
  { id: "m1", kind: "pay_out" as const, amount: 1250 },
  { id: "m2", kind: "pay_out" as const, amount: 120 },
  { id: "m3", kind: "pay_out" as const, amount: 80 },
  { id: "m4", kind: "pay_out" as const, amount: 2000 },
  { id: "m5", kind: "pay_out" as const, amount: 45.5 },
  { id: "m8", kind: "pay_out" as const, amount: 60 },
  { id: "m6", kind: "pay_in" as const, amount: 500 },
  { id: "m7", kind: "collect" as const, amount: 3000 },
];

const recorded = "recorded" as const;
const links = new Map([
  ["m1", { categoryName: "Gas / LPG", group: "utilities" as const, status: recorded }],
  ["m2", { categoryName: "Ice (Yelo)", group: "ingredients" as const, status: recorded }],
  ["m3", { categoryName: "Ice (Yelo)", group: "ingredients" as const, status: recorded }],
  ["m4", { categoryName: "Owner took cash (Kinuha ng may-ari)", group: "not_expense" as const, status: recorded }],
  ["m8", { categoryName: "Transport", group: "operating" as const, status: "void" as const }],
]);

describe("summarizeShiftPayouts", () => {
  it("splits pay-outs into expenses, cash taken out and unsorted, ignoring pay-ins and pickups", () => {
    const payouts = summarizeShiftPayouts(moves, links);

    expect(payouts.expenses).toEqual({
      cents: 145_000,
      count: 3,
      byCategory: [
        { name: "Gas / LPG", cents: 125_000, count: 1 },
        { name: "Ice (Yelo)", cents: 20_000, count: 2 },
      ],
    });
    expect(payouts.takenOut).toEqual({ cents: 200_000, count: 1 });
    expect(payouts.unsorted).toEqual({ cents: 4_550, count: 1 });
    // Undone on the open shift: its cash came back as a pay-in.
    expect(payouts.undone).toEqual({ cents: 6_000, count: 1 });
  });

  it("reads as the shift card's lines and the close summary", () => {
    const payouts = summarizeShiftPayouts(moves, links);
    expect(payoutLines(payouts)).toEqual([
      { label: "Paid for expenses (3)", value: "−₱1,450" },
      { label: "Cash taken out (1)", value: "−₱2,000" },
      { label: "Paid out (1)", value: "−₱45.50" },
      { label: "Expenses undone (1)", value: "−₱60" },
    ]);
    expect(describeShiftExpenses(payouts)).toBe(
      "Paid for expenses ₱1,450 (3): Gas / LPG ₱1,250, Ice ₱200. Cash taken out ₱2,000 (1).",
    );
  });

  it("says nothing for a shift with no pay-outs", () => {
    const payouts = summarizeShiftPayouts([{ id: "x", kind: "pay_in", amount: 100 }], new Map());
    expect(payoutLines(payouts)).toEqual([]);
    expect(describeShiftExpenses(payouts)).toBeNull();
  });
});

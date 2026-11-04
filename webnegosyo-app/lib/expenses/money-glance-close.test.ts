import { closeReview, closeShiftLines, closedConfirmation, countVerdict, drawerExpenseItems, hasDrawerChanged, handOverText } from "./money-glance-close";
import { summarizeShiftPayouts } from "./drawer-expenses";
import type { MovementLink } from "./expense-service";
import type { CashMove } from "../cash-drawers";
import { summarizeCashMoves } from "../cash-drawers";
import { reconcileShift } from "../shift";

function move(id: string, kind: CashMove["kind"], amount: number, reason: string | null, createdAt: string): CashMove {
  return { id, shiftId: "s1", kind, amount, reason, recordedByName: "Ben", createdAt };
}

function link(categoryId: string, categoryName: string, group: MovementLink["group"], status: MovementLink["status"] = "recorded"): MovementLink {
  return { expenseId: `x-${categoryId}`, categoryId, categoryName, group, status };
}

// 10:12 AM, 11:30 AM, 3:05 PM, 4:00 PM, 5:00 PM in Manila.
const moves: CashMove[] = [
  move("m1", "pay_out", 1_180, "LPG 11kg", "2026-10-22T02:12:00Z"),
  move("m2", "pay_out", 150, "Ice (Yelo)", "2026-10-22T03:30:00Z"),
  move("m3", "pay_out", 150, "Ice (Yelo)", "2026-10-22T07:05:00Z"),
  move("m4", "pay_out", 1_000, "Owner took cash", "2026-10-22T08:00:00Z"),
  move("m5", "collect", 1_000, null, "2026-10-22T09:00:00Z"),
];
const links = new Map<string, MovementLink>([
  ["m1", link("lpg", "Gas / LPG", "utilities")],
  ["m2", link("ice", "Ice (Yelo)", "ingredients")],
  ["m3", link("ice", "Ice (Yelo)", "ingredients")],
  ["m4", link("owner", "Owner took cash", "not_expense")],
]);

describe("closeShiftLines", () => {
  it("builds what the drawer should hold line by line, and the lines add up to it", () => {
    // Arrange
    const totals = summarizeCashMoves(moves);
    const rec = reconcileShift({ openingFloat: 2_000, cashCollected: 6_240, moves: totals });

    // Act
    const result = closeShiftLines({
      openingFloat: 2_000,
      cashSales: 6_240,
      moves: totals,
      payouts: summarizeShiftPayouts(moves, links),
      expectedInDrawer: rec.expectedInDrawer,
    });

    // Assert
    expect(result.lines.map((line) => [line.label, line.sign, line.cents])).toEqual([
      ["Starting cash", "", 2_000_00],
      ["Cash sales", "+", 6_240_00],
      ["Paid for expenses · 3", "-", 1_480_00],
      ["Cash taken out", "-", 2_000_00],
    ]);
    expect(result.totalCents).toBe(4_760_00);
    const sum = result.lines.reduce((total, line) => total + (line.sign === "-" ? -line.cents : line.cents), 0);
    expect(sum).toBe(result.totalCents);
  });

  it("shows cash put in, old free-text pay-outs and undone expenses so the sum still reads", () => {
    const extra = [
      move("a", "pay_in", 200, "Coins", "2026-10-22T02:00:00Z"),
      move("b", "pay_out", 85.5, "Rider", "2026-10-22T02:30:00Z"),
      move("c", "pay_out", 120, "Yelo", "2026-10-22T03:00:00Z"),
    ];
    const extraLinks = new Map<string, MovementLink>([["c", link("ice", "Ice (Yelo)", "ingredients", "void")]]);
    const totals = summarizeCashMoves(extra);
    const rec = reconcileShift({ openingFloat: 0, cashCollected: 500, moves: totals, isZeroBalance: true });

    const result = closeShiftLines({
      openingFloat: 0,
      cashSales: 500,
      moves: totals,
      payouts: summarizeShiftPayouts(extra, extraLinks),
      expectedInDrawer: rec.expectedInDrawer,
    });

    expect(result.lines.map((line) => line.label)).toEqual([
      "Starting cash",
      "Cash sales",
      "Cash put in",
      "Paid out · 1",
      "Expenses undone · 1",
    ]);
    expect(result.lines.find((line) => line.label === "Paid out · 1")?.cents).toBe(85_50);
    const sum = result.lines.reduce((total, line) => total + (line.sign === "-" ? -line.cents : line.cents), 0);
    expect(sum).toBe(result.totalCents);
  });

  it("falls back to one pay-out line when the pay-outs could not be told apart", () => {
    const totals = summarizeCashMoves(moves);
    const result = closeShiftLines({ openingFloat: 2_000, cashSales: 6_240, moves: totals, payouts: null, expectedInDrawer: 4_760 });

    expect(result.lines.map((line) => [line.label, line.cents])).toEqual([
      ["Starting cash", 2_000_00],
      ["Cash sales", 6_240_00],
      ["Paid out", 2_480_00],
      ["Cash taken out", 1_000_00],
    ]);
  });
});

describe("drawerExpenseItems", () => {
  it("lists what the drawer paid for, repeats of one thing grouped with their times", () => {
    const items = drawerExpenseItems(moves, links);

    expect(items).toEqual([
      { key: "lpg|LPG 11kg", categoryId: "lpg", title: "LPG 11kg", detail: "10:12 AM", cents: 1_180_00, count: 1 },
      { key: "ice|Ice (Yelo)", categoryId: "ice", title: "Yelo · 2 times", detail: "11:30 AM, 3:05 PM", cents: 300_00, count: 2 },
    ]);
  });

  it("leaves out cash taken out, undone expenses and pay-outs with no category", () => {
    const items = drawerExpenseItems(
      [move("a", "pay_out", 50, "Rider", "2026-10-22T02:00:00Z"), move("b", "pay_out", 60, "Ice", "2026-10-22T02:00:00Z")],
      new Map([["b", link("ice", "Ice (Yelo)", "ingredients", "void")]]),
    );

    expect(items).toEqual([]);
  });
});

describe("countVerdict", () => {
  it("states short, over and exact plainly", () => {
    expect(countVerdict(4_760, 4_640)).toEqual({ kind: "short", text: "₱120 short" });
    expect(countVerdict(4_760, 4_810)).toEqual({ kind: "over", text: "₱50 over" });
    expect(countVerdict(4_760, 4_760)).toEqual({ kind: "exact", text: "Exact" });
  });

  it("keeps centavos when the difference has some", () => {
    expect(countVerdict(100.25, 100)).toEqual({ kind: "short", text: "₱0.25 short" });
  });
});

describe("handOverText", () => {
  it("says what to hand over and what stays for the next shift", () => {
    expect(handOverText({ counted: 4_640, floatToKeep: 2_000, isZeroBalance: false })).toBe(
      "Hand over ₱2,640 and leave ₱2,000 in the drawer for the next shift.",
    );
  });

  it("hands over everything from a zero-balance drawer", () => {
    expect(handOverText({ counted: 4_640.5, floatToKeep: 0, isZeroBalance: true })).toBe(
      "Hand over all ₱4,640.50. This drawer ends empty.",
    );
  });

  it("never leaves more in the drawer than was counted", () => {
    expect(handOverText({ counted: 1_500, floatToKeep: 2_000, isZeroBalance: false })).toBe(
      "Hand over ₱0 and leave ₱1,500 in the drawer for the next shift.",
    );
  });
});

describe("closeReview", () => {
  const shift = { id: "s1", staffName: "Ben Santos", drawerName: "Cashier 1", openingFloat: 2_000, isZeroBalance: false };

  it("freezes everything the close sheet shows from one fresh read", () => {
    // Arrange
    const totals = summarizeCashMoves(moves);
    const rec = reconcileShift({ openingFloat: 2_000, cashCollected: 6_240, moves: totals });

    // Act
    const review = closeReview({ shift, isMine: true, cashSales: 6_240, moves, links, reconciliation: rec, counted: 4_640 });

    // Assert
    expect(review.title).toBe("End your shift");
    expect(review.subtitle).toBe("Cashier 1");
    expect(review.totalCents).toBe(4_760_00);
    expect(review.lines).toHaveLength(4);
    expect(review.items.map((item) => item.title)).toEqual(["LPG 11kg", "Yelo · 2 times"]);
    expect(review.countedCents).toBe(4_640_00);
    expect(review.verdict).toEqual({ kind: "short", text: "₱120 short" });
    expect(review.verdictNote).toBe("The owner will see this on the shift.");
  });

  it("names the cashier when a manager closes someone else's drawer, and copes without links", () => {
    const totals = summarizeCashMoves(moves);
    const rec = reconcileShift({ openingFloat: 2_000, cashCollected: 6_240, moves: totals });

    const review = closeReview({ shift, isMine: false, cashSales: 6_240, moves, links: null, reconciliation: rec, counted: 4_760 });

    expect(review.title).toBe("End Ben's shift");
    expect(review.items).toEqual([]);
    expect(review.lines.map((line) => line.label)).toContain("Paid out");
    expect(review.verdict.kind).toBe("exact");
    expect(review.verdictNote).toBe("Saved on Ben's shift.");
  });
});

describe("hasDrawerChanged", () => {
  it("is false for the same drawer figure, whatever float noise the pesos carry", () => {
    expect(hasDrawerChanged(125, 125)).toBe(false);
    expect(hasDrawerChanged(0.1 + 0.2, 0.3)).toBe(false);
  });

  it("is true once the figure moved by a centavo or more", () => {
    expect(hasDrawerChanged(125, 175)).toBe(true);
    expect(hasDrawerChanged(125, 124.99)).toBe(true);
  });
});

describe("closedConfirmation", () => {
  const shift = { id: "s1", staffName: "Ben Santos", drawerName: "Cashier 1", openingFloat: 2_000, isZeroBalance: false };
  const rec = () => reconcileShift({ openingFloat: 2_000, cashCollected: 6_240, moves: summarizeCashMoves(moves) });

  it("says the shift ended, what was counted, the difference, and what the drawer paid for", () => {
    const review = closeReview({ shift, isMine: true, cashSales: 6_240, moves, links, reconciliation: rec(), counted: 4_640 });

    const done = closedConfirmation(review);

    expect(done.title).toBe("Shift ended");
    expect(done.message).toBe(
      "Counted ₱4,640 · ₱120 short\n\nPaid for expenses ₱1,480 (3): Gas / LPG ₱1,180, Ice ₱300. Cash taken out ₱1,000 (1).",
    );
  });

  it("names the cashier on a manager's close and says nothing about expenses it could not read", () => {
    const review = closeReview({ shift, isMine: false, cashSales: 6_240, moves, links: null, reconciliation: rec(), counted: 4_760 });

    expect(closedConfirmation(review)).toEqual({ title: "Ben's shift closed", message: "Counted ₱4,760 · Exact" });
  });
});


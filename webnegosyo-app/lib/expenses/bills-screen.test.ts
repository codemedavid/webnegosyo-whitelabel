import { BILL_TODAY, billOf, markOf, paymentOf } from "./bills-fixtures";
import {
  amountChips,
  amountText,
  billPill,
  billPaymentOutletId,
  buildBillsView,
  detailBillLink,
  dueLine,
  findBillRow,
  leftToPayText,
  linkCandidates,
  linkWindowMonths,
  paidForText,
  pauseChoices,
  pauseRefusal,
  payBranchLine,
  payContextFor,
  payForLine,
  shortDate,
  skipChoice,
  snoozeDueOns,
  stillToPayLine,
  stopNote,
  targetDueOn,
  usualAmountLine,
  whenWords,
} from "./bills-screen";
import { homeExpense } from "./expenses-home-fixtures";

const today = BILL_TODAY; // Thursday 22 Oct 2026

const rent = billOf();
const kuryente = billOf({
  id: "bill-kuryente",
  name: "Kuryente",
  categoryId: "electricity",
  amountCents: null,
  rule: { kind: "monthly", day: 15 },
  remindDaysBefore: 1,
});
const internet = billOf({
  id: "bill-internet",
  name: "Internet",
  categoryId: "internet",
  amountCents: 169_900,
  rule: { kind: "monthly", day: 5 },
  startsOn: "2026-07-01",
});
const permit = billOf({
  id: "bill-permit",
  name: "Business permit",
  categoryId: "other",
  amountCents: 500_000,
  rule: { kind: "months", every: 12, day: 15 },
  startsOn: "2026-03-01",
});

const payments = [
  paymentOf({ billId: "bill-rent", dueOn: "2026-07-24", expenseId: "r7" }),
  paymentOf({ billId: "bill-rent", dueOn: "2026-08-24", expenseId: "r8" }),
  paymentOf({ billId: "bill-rent", dueOn: "2026-09-24", expenseId: "r9" }),
  paymentOf({ billId: "bill-kuryente", dueOn: "2026-08-15", amountCents: 580_000, expenseId: "k1" }),
  paymentOf({ billId: "bill-kuryente", dueOn: "2026-09-15", amountCents: 640_000, expenseId: "k2" }),
  paymentOf({ billId: "bill-permit", dueOn: "2026-03-15", amountCents: 500_000, expenseId: "p1" }),
];

function view(overrides: Partial<Parameters<typeof buildBillsView>[0]> = {}) {
  return buildBillsView({ bills: [rent, kuryente, internet, permit], payments, marks: [], today, ...overrides });
}

function rowsOf(group: string, result = view()) {
  return result.groups.find((candidate) => candidate.key === group)?.rows ?? [];
}

describe("date words", () => {
  it("writes a due date the way people say it", () => {
    expect(shortDate("2026-10-24", today)).toBe("Sat 24 Oct");
    expect(shortDate("2027-03-15", today)).toBe("Mon 15 Mar 2027");
    expect(whenWords("2026-10-22", today)).toBe("today");
    expect(whenWords("2026-10-23", today)).toBe("tomorrow");
    expect(whenWords("2026-10-27", today)).toBe("Tue");
    expect(whenWords("2026-11-05", today)).toBe("5 Nov");
  });
});

describe("buildBillsView", () => {
  it("puts a missed bill under Late with how late it is and its estimate", () => {
    const [row] = rowsOf("late").filter((candidate) => candidate.bill.id === "bill-kuryente");
    expect(row.pill).toEqual({ text: "7 days late", tone: "late" });
    expect(row.amount).toBe("about ₱6,100");
    expect(row.note).toBeNull();
  });

  it("collapses several missed months into one row that says how many", () => {
    const [row] = rowsOf("late").filter((candidate) => candidate.bill.id === "bill-internet");
    expect(row.occurrence.lateCount).toBe(3);
    expect(row.note).toBe("3 months not marked");
    expect(row.pill.text).toBe("17 days late");
    expect(targetDueOn(row.occurrence)).toBe("2026-08-05");
  });

  it("lists a bill due within six days under This week, by weekday", () => {
    const [row] = rowsOf("week");
    expect(row.bill.name).toBe("Rent");
    expect(row.pill).toEqual({ text: "Due Sat", tone: "soon" });
    expect(row.amount).toBe("₱15,000");
    expect(row.rule).toBe("Every month on the 24th");
  });

  it("still shows a far-off bill once, under Later, with its date", () => {
    const later = rowsOf("later");
    expect(later.map((row) => row.bill.name)).toEqual(["Business permit"]);
    expect(later[0].pill).toEqual({ text: "Due 15 Mar 2027", tone: "later" });
  });

  it("orders open rows late first for the home card", () => {
    expect(view().open.map((row) => row.bill.name)).toEqual(["Internet", "Kuryente", "Rent", "Business permit"]);
  });

  it("moves a paid or skipped due date to Paid this month", () => {
    const result = view({
      payments: [...payments, paymentOf({ billId: "bill-kuryente", dueOn: "2026-10-15", amountCents: 612_000, expenseId: "k3" })],
      marks: [markOf({ billId: "bill-rent", dueOn: "2026-10-24", kind: "skipped" })],
    });
    const settled = rowsOf("settled", result);
    expect(settled.map((row) => [row.bill.name, row.pill.text, row.amount])).toEqual([
      ["Kuryente", "Paid", "₱6,120"],
      ["Rent", "Nothing to pay", "₱15,000"],
    ]);
    expect(rowsOf("week", result)).toEqual([]);
  });

  it("files a snoozed bill by the day the reminder comes back", () => {
    const result = view({ marks: [markOf({ billId: "bill-kuryente", dueOn: "2026-10-15", kind: "snoozed", snoozedUntil: "2026-10-23" })] });
    const [row] = rowsOf("week", result).filter((candidate) => candidate.bill.id === "bill-kuryente");
    expect(row.pill).toEqual({ text: "Reminding tomorrow", tone: "snoozed" });
  });

  it("keeps a paused bill in its own folded group and out of what is left to pay", () => {
    const result = view({ bills: [billOf({ status: "paused", pausedUntil: null })] });
    expect(result.groups.map((group) => group.key)).toEqual(["paused"]);
    expect(rowsOf("paused", result)[0].pill).toEqual({ text: "Paused", tone: "paused" });
    expect(result.still).toEqual({ cents: 0, count: 0, hasEstimate: false });
  });

  it("says until when a dated pause lasts", () => {
    const result = view({ bills: [billOf({ status: "paused", pausedUntil: "2026-12-01" })] });
    expect(rowsOf("paused", result)[0].pill.text).toBe("Paused till 1 Dec");
  });

  it("shows a stopped bill only for what it was paid this month", () => {
    const stopped = billOf({ status: "ended" });
    expect(view({ bills: [stopped] }).groups).toEqual([]);
    const paidThisMonth = view({ bills: [stopped], payments: [paymentOf({ dueOn: "2026-10-01", spentOn: "2026-10-01" })] });
    expect(paidThisMonth.groups.map((group) => group.key)).toEqual(["settled"]);
    expect(paidThisMonth.billCount).toBe(0);
  });

  it("totals what is left this month, counting each missed month", () => {
    const { still } = view();
    // Internet 3 × ₱1,699 + Kuryente about ₱6,100 + Rent ₱15,000.
    expect(still).toEqual({ cents: 3 * 169_900 + 610_000 + 1_500_000, count: 5, hasEstimate: true });
    expect(leftToPayText(still, today)).toBe("about ₱26,197 left in October");
    expect(stillToPayLine(still)).toBe("about ₱26,197 still to pay · 5 bills");
  });

  it("says nothing is left when every bill is settled", () => {
    const none = { cents: 0, count: 0, hasEstimate: false };
    expect(leftToPayText(none, today)).toBe("Nothing left to pay in October");
    expect(stillToPayLine(none)).toBeNull();
    expect(stillToPayLine({ cents: 1_500_000, count: 1, hasEstimate: false })).toBe("₱15,000 still to pay · 1 bill");
  });
});

describe("bill sheet words", () => {
  it("writes the due line under the name", () => {
    expect(dueLine(rent, "2026-10-24", today)).toBe("Due Sat 24 Oct · every month on the 24th");
  });

  it("states the usual amount: fixed, the last three, or unknown", () => {
    expect(usualAmountLine(rent, payments)).toBe("₱15,000 every time");
    expect(usualAmountLine(kuryente, payments)).toBe("Last 2: ₱6,400 · ₱5,800");
    expect(usualAmountLine(billOf({ id: "new", amountCents: null }), payments)).toBe("Changes every time");
  });

  it("offers Usual and Last chips only when they differ", () => {
    expect(amountChips(610_000, 640_000).map((chip) => chip.label)).toEqual(["Usual ₱6,100", "Last ₱6,400"]);
    expect(amountChips(610_000, 610_000).map((chip) => chip.label)).toEqual(["Usual ₱6,100"]);
    expect(amountChips(null, null)).toEqual([]);
  });

  it("hands the pay sheet the bill, the due date and its usual figures", () => {
    expect(payContextFor(kuryente, "2026-10-15", payments)).toEqual({
      billId: "bill-kuryente",
      dueOn: "2026-10-15",
      name: "Kuryente",
      amountCents: null,
      usualCents: 610_000,
      lastCents: 640_000,
      categoryId: "electricity",
      paidFrom: "bank",
      paidToName: "Aling Nena",
      supplierId: null,
      outletId: null,
      branchName: null,
    });
    expect(payContextFor(billOf({ outletId: "katipunan" }), "2026-10-24", payments, [{ id: "katipunan", name: "Katipunan" }]).branchName).toBe(
      "Katipunan",
    );
    expect(payContextFor(rent, "2026-10-24", payments)).toMatchObject({ amountCents: 1_500_000, usualCents: null, lastCents: null });
  });

  it("says which bill a payment is for", () => {
    expect(payForLine("2026-10-24", today)).toBe("For: October bill · due Sat 24 Oct");
    expect(paidForText("Rent", "2026-10-24")).toBe("Rent · October");
    expect(paidForText(null, null)).toBe("A bill");
  });

  it("counts past payments only when the board saw them all", () => {
    expect(stopNote(billOf({ createdAt: "2026-09-01T00:00:00Z" }), payments, "2026-06-24")).toBe(
      "Your 3 past payments stay in Expenses. It just stops reminding you.",
    );
    expect(stopNote(rent, payments, "2026-06-24")).toBe("Every past payment stays in Expenses. It just stops reminding you.");
    expect(stopNote(billOf({ id: "fresh", createdAt: "2026-10-20T00:00:00Z" }), payments, "2026-06-24")).toBe(
      "Nothing you paid changes. It just stops reminding you.",
    );
  });

  it("offers pauses until the next two month starts, or until turned back on", () => {
    expect(pauseChoices(today)).toEqual([
      { key: "open", label: "Until I turn it back on", until: null },
      { key: "next", label: "Until 1 Nov", until: "2026-11-01" },
      { key: "after", label: "Until 1 Dec", until: "2026-12-01" },
    ]);
  });

  it("refuses a resume day on or before today, in the same words as the service", () => {
    expect(pauseRefusal("2026-10-22", today)).toBe("Pick a day after today.");
    expect(pauseRefusal("2026-10-01", today)).toBe("Pick a day after today.");
    expect(pauseRefusal("2026-10-23", today)).toBeNull();
    expect(pauseRefusal(null, today)).toBeNull();
  });

  it("files a branch bill's payment on that branch; a store-wide one where the person records", () => {
    expect(billPaymentOutletId({ outletId: "katipunan" }, "maginhawa")).toBe("katipunan");
    expect(billPaymentOutletId({ outletId: null }, "maginhawa")).toBe("maginhawa");
    expect(billPaymentOutletId({}, null)).toBeNull();
  });

  it("names the locked branch on the pay sheet, never for a store-wide bill", () => {
    expect(payBranchLine({ outletId: "katipunan", branchName: "Katipunan" })).toBe("Branch: Katipunan (this bill's branch)");
    expect(payBranchLine({ outletId: "katipunan" })).toBe("Branch: this bill's branch");
    expect(payBranchLine({ outletId: null })).toBeNull();
  });

  it("an \"about every N days\" bill last marked long ago says \"Not marked in a while\"", () => {
    const lpg = billOf({ id: "bill-lpg", name: "LPG", amountCents: null, rule: { kind: "after_days", every: 10 } });
    const late = { ...view().open[0].occurrence, billId: "bill-lpg", state: "late" as const, dueOn: "2026-07-17", daysLate: 97 };
    expect(billPill(late, today, lpg.rule)).toEqual({ text: "Not marked in a while", tone: "late" });
    expect(billPill({ ...late, daysLate: 60 }, today, lpg.rule).text).toBe("60 days late");
    expect(billPill(late, today, rent.rule).text).toBe("97 days late");
    const board = buildBillsView({ bills: [billOf({ ...lpg, startsOn: "2026-07-17" })], payments: [], marks: [], today });
    expect(board.open[0].pill.text).toBe("Not marked in a while");
  });

  it("reads an estimate as about", () => {
    expect(amountText({ amountCents: 610_000, isEstimate: true })).toBe("about ₱6,100");
    expect(amountText({ amountCents: null, isEstimate: false })).toBeNull();
  });
});

describe("linkCandidates", () => {
  const due = "2026-10-15";

  it("offers recorded expenses of the same category within 10 days, closest first", () => {
    const expenses = [
      homeExpense({ id: "far", categoryId: "electricity", spentOn: "2026-10-26" }),
      homeExpense({ id: "near", categoryId: "electricity", spentOn: "2026-10-14" }),
      homeExpense({ id: "edge", categoryId: "electricity", spentOn: "2026-10-05" }),
    ];
    expect(linkCandidates(expenses, kuryente, due).map((expense) => expense.id)).toEqual(["near", "edge"]);
  });

  it("never offers a voided expense, another category, or one already paying a bill", () => {
    const expenses = [
      homeExpense({ id: "void", categoryId: "electricity", spentOn: due, status: "void" }),
      homeExpense({ id: "water", categoryId: "water", spentOn: due }),
      homeExpense({ id: "linked", categoryId: "electricity", spentOn: due, billId: "bill-x", billDueOn: due }),
    ];
    expect(linkCandidates(expenses, kuryente, due)).toEqual([]);
  });

  it("offers a branch bill only that branch's expenses; a store-wide bill any branch's", () => {
    const expenses = [
      homeExpense({ id: "here", categoryId: "electricity", spentOn: due, outletId: "katipunan" }),
      homeExpense({ id: "there", categoryId: "electricity", spentOn: due, outletId: "maginhawa" }),
      homeExpense({ id: "store", categoryId: "electricity", spentOn: due, outletId: null }),
    ];
    const ids = (bill: Parameters<typeof linkCandidates>[1]) => linkCandidates(expenses, bill, due).map((expense) => expense.id).sort();
    expect(ids({ ...kuryente, outletId: "katipunan" })).toEqual(["here"]);
    expect(ids(kuryente)).toEqual(["here", "store", "there"]);
  });

  it("reads the months the window touches", () => {
    expect(linkWindowMonths("2026-10-15")).toEqual(["2026-10"]);
    expect(linkWindowMonths("2026-10-03")).toEqual(["2026-09", "2026-10"]);
  });
});

describe("findBillRow", () => {
  it("finds the due date a sheet was opened on, else the bill's first open row", () => {
    const result = view();
    expect(findBillRow(result, "bill-internet", "2026-09-05")?.occurrence.lateCount).toBe(3);
    expect(findBillRow(result, "bill-rent")?.occurrence.dueOn).toBe("2026-10-24");
    expect(findBillRow(result, "bill-rent", "2026-01-24")?.occurrence.dueOn).toBe("2026-10-24");
    expect(findBillRow(result, "missing")).toBeNull();
  });
});

describe("detailBillLink", () => {
  const rentCategory = { name: "Rent (Upa)", group: "occupancy" as const };

  it("says which bill a payment was for and links to it", () => {
    const expense = homeExpense({ billId: "bill-rent", billDueOn: "2026-10-24", categoryId: "rent" });
    expect(detailBillLink({ expense, category: rentCategory, bills: [rent], canManage: true })).toEqual({
      kind: "paid_for",
      text: "Rent · October",
      href: "/(main)/expense-bills?bill=bill-rent",
      canUnlink: true,
    });
  });

  it("offers Not for this bill only on a recorded expense", () => {
    const voided = homeExpense({ billId: "bill-rent", billDueOn: "2026-10-24", categoryId: "rent", status: "void" });
    expect(detailBillLink({ expense: voided, category: rentCategory, bills: [rent], canManage: true })).toMatchObject({
      kind: "paid_for",
      canUnlink: false,
    });
  });

  it("offers Repeat this for a one-off spend that could be a bill", () => {
    const expense = homeExpense({ categoryId: "rent", amountCents: 1_500_000, spentOn: "2026-10-05" });
    expect(detailBillLink({ expense, category: rentCategory, bills: [], canManage: true })).toEqual({
      kind: "repeat",
      categoryName: "Upa",
      href: "/(main)/expense-bills?new=1&category=rent&amount=1500000&day=5",
    });
  });

  it("never offers it for ingredients, cash moved, a voided row, a store with that bill, or without access", () => {
    const expense = homeExpense({ categoryId: "rent" });
    expect(detailBillLink({ expense, category: { name: "Ice", group: "ingredients" }, bills: [], canManage: true })).toBeNull();
    expect(detailBillLink({ expense, category: { name: "Owner took cash", group: "not_expense" }, bills: [], canManage: true })).toBeNull();
    expect(detailBillLink({ expense: { ...expense, status: "void" }, category: rentCategory, bills: [], canManage: true })).toBeNull();
    expect(detailBillLink({ expense, category: rentCategory, bills: [rent], canManage: true })).toBeNull();
    expect(detailBillLink({ expense, category: rentCategory, bills: [], canManage: false })).toBeNull();
  });
});

describe("acting on a row of several late dates", () => {
  const lateInternet = (result = view()) => rowsOf("late", result).find((row) => row.bill.id === "bill-internet")!;
  const snoozedAll = (until: string) =>
    ["2026-08-05", "2026-09-05", "2026-10-05"].map((dueOn) => markOf({ billId: "bill-internet", dueOn, kind: "snoozed", snoozedUntil: until }));

  it("Remind me tomorrow quiets every late date in the row, a single one only itself", () => {
    expect(snoozeDueOns(lateInternet().occurrence)).toEqual(["2026-08-05", "2026-09-05", "2026-10-05"]);
    const kuryenteRow = rowsOf("late").find((row) => row.bill.id === "bill-kuryente")!;
    expect(snoozeDueOns(kuryenteRow.occurrence)).toEqual(["2026-10-15"]);
  });

  it("a bill whose late dates are all snoozed shows ONCE, still saying how many", () => {
    // Act
    const result = view({ marks: snoozedAll("2026-10-23") });

    // Assert
    const rows = result.groups.flatMap((group) => group.rows).filter((row) => row.bill.id === "bill-internet");
    expect(rows).toHaveLength(1);
    expect(rows[0].pill).toEqual({ text: "Reminding tomorrow", tone: "snoozed" });
    expect(rows[0].note).toBe("3 months not marked");
    expect(targetDueOn(rows[0].occurrence)).toBe("2026-08-05");
    // Snoozing again (or from the reminder) covers the same three.
    expect(snoozeDueOns(rows[0].occurrence)).toEqual(["2026-08-05", "2026-09-05", "2026-10-05"]);
  });

  it("once the snooze runs out the dates are late again, in one row", () => {
    const result = view({ marks: snoozedAll("2026-10-22") });
    expect(lateInternet(result).occurrence.lateCount).toBe(3);
  });

  it("Nothing to pay names the ONE month it skips when the row covers several", () => {
    expect(skipChoice(internet, lateInternet().occurrence, today)).toEqual({
      dueOn: "2026-08-05",
      label: "Nothing to pay for August",
      done: "Internet: nothing to pay for August",
    });
    const kuryenteRow = rowsOf("late").find((row) => row.bill.id === "bill-kuryente")!;
    expect(skipChoice(kuryente, kuryenteRow.occurrence, today)).toEqual({
      dueOn: "2026-10-15",
      label: "Nothing to pay this time",
      done: "Kuryente: nothing to pay this time",
    });
  });

  it("a weekly bill names the day instead of the month", () => {
    const weekly = billOf({ id: "bill-ice", name: "Ice", rule: { kind: "weekly", every: 1, weekday: 4 }, startsOn: "2026-10-01" });
    const result = view({ bills: [weekly] });
    const row = rowsOf("late", result)[0];
    expect(skipChoice(weekly, row.occurrence, today).label).toBe("Nothing to pay for 1 Oct");
  });

  it("after skipping the oldest, the rest still show as one late row", () => {
    const result = view({ marks: [markOf({ billId: "bill-internet", dueOn: "2026-08-05", kind: "skipped" })] });
    const row = lateInternet(result);
    expect(row.occurrence.lateCount).toBe(2);
    expect(row.note).toBe("2 months not marked");
    expect(targetDueOn(row.occurrence)).toBe("2026-09-05");
  });
});

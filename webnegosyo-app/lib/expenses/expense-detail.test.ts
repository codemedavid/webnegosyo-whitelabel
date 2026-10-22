import { computeFlagsForAll } from "./flags";
import {
  detailAccess,
  detailActions,
  factRows,
  flagCallouts,
  longDayText,
  receiptTiles,
  statusPill,
  timelineEntries,
  viewerItems,
  whenText,
} from "./expense-detail";
import type { ExpenseDetail } from "./expense-service";
import type { Expense, ExpenseCategory } from "./types";

// Thu 22 Oct 2026, 12:00 Manila.
const NOW = Date.parse("2026-10-22T04:00:00Z");

const base: Expense = {
  id: "e1", tenantId: "t1", outletId: null, categoryId: "lpg", supplierId: null, paidToName: null, staffUserId: null,
  note: "LPG 11kg", amountCents: 118_000, spentOn: "2026-10-22", paidFrom: "drawer", shiftCashMovementId: "m1",
  isStockPurchase: false, status: "recorded", voidReason: null, voidedBy: null, voidedAt: null,
  replacesExpenseId: null, clientRequestId: "req-1", createdBy: null, createdByName: "Ben Santos",
  createdAt: "2026-10-22T02:12:00Z", receiptCount: 0, billId: null, billDueOn: null, docType: null, invoiceNo: null, supplierTin: null,
  vatCents: null, ewtCents: null, ewtRate: null, form2307Given: false,
};

function category(id: string, name: string, group: ExpenseCategory["group"]): ExpenseCategory {
  return { id, tenantId: "t1", systemKey: id, name, icon: null, group, needsNote: false, sortOrder: 0, archivedAt: null };
}
const categories = [category("lpg", "Gas / LPG", "utilities"), category("other", "Other", "other")];

function detailOf(expense: Partial<Expense>, extra: Partial<ExpenseDetail> = {}): ExpenseDetail {
  return {
    expense: { ...base, ...expense },
    receipts: [],
    replaces: null,
    replacedBy: null,
    drawer: { shiftId: "s1", drawerName: "Front till", isShiftOpen: true },
    ...extra,
  };
}

describe("dates", () => {
  it("writes a day as weekday, day, month — never raw ISO", () => {
    expect(longDayText("2026-10-22", NOW)).toBe("Thu, 22 Oct");
    expect(longDayText("2025-12-31", NOW)).toBe("Wed, 31 Dec 2025");
  });

  it("adds the clock time when the expense was recorded on the day it was spent", () => {
    expect(whenText(base, NOW)).toBe("Thu, 22 Oct · 10:12 AM");
  });

  it("shows only the day when it was entered later (the time would be the typing time)", () => {
    expect(whenText({ ...base, spentOn: "2026-10-20" }, NOW)).toBe("Tue, 20 Oct");
  });
});

describe("statusPill", () => {
  it("says how it was paid in plain words", () => {
    expect(statusPill({ expense: base, isChange: false, isReplaced: false, isWaitingOnPhone: false })).toEqual({
      text: "Recorded · paid from drawer",
      tone: "good",
    });
    expect(statusPill({ expense: { ...base, paidFrom: "gcash" }, isChange: false, isReplaced: false, isWaitingOnPhone: false }).text).toBe(
      "Recorded · paid with GCash",
    );
    expect(statusPill({ expense: { ...base, paidFrom: "owner" }, isChange: false, isReplaced: false, isWaitingOnPhone: false }).text).toBe(
      "Recorded · paid from the owner's pocket",
    );
  });

  it("names a void with its reason, in red", () => {
    expect(
      statusPill({ expense: { ...base, status: "void", voidReason: "Recorded twice" }, isChange: false, isReplaced: false, isWaitingOnPhone: false }),
    ).toEqual({ text: "Voided — Recorded twice", tone: "danger" });
    expect(statusPill({ expense: { ...base, status: "void" }, isChange: false, isReplaced: false, isWaitingOnPhone: false }).text).toBe("Voided");
  });

  it("tells a changed row from a voided one", () => {
    expect(statusPill({ expense: { ...base, status: "void" }, isChange: false, isReplaced: true, isWaitingOnPhone: false })).toEqual({
      text: "Changed — a newer version replaced this one",
      tone: "neutral",
    });
    expect(statusPill({ expense: base, isChange: true, isReplaced: false, isWaitingOnPhone: false })).toEqual({
      text: "Changed — this is the new version",
      tone: "good",
    });
  });

  it("says when this phone still holds it", () => {
    expect(statusPill({ expense: base, isChange: false, isReplaced: false, isWaitingOnPhone: true })).toEqual({
      text: "Waiting to send from this phone",
      tone: "warning",
    });
  });
});

describe("factRows", () => {
  it("lists when, paid from, branch and who, in that order", () => {
    expect(factRows({ detail: detailOf({}), branchName: "Katipunan", now: NOW })).toEqual([
      { key: "when", label: "When", value: "Thu, 22 Oct · 10:12 AM" },
      { key: "paidFrom", label: "Paid from", value: "Front till · shift still open" },
      { key: "branch", label: "Branch", value: "Katipunan" },
      { key: "recordedBy", label: "Recorded by", value: "Ben Santos" },
    ]);
  });

  it("says a drawer's shift is closed, and copes with an unreadable drawer", () => {
    const closed = detailOf({}, { drawer: { shiftId: "s1", drawerName: null, isShiftOpen: false } });
    expect(factRows({ detail: closed, branchName: null, now: NOW })[1].value).toBe("Cash drawer · shift closed");
    const unknown = detailOf({}, { drawer: null });
    expect(factRows({ detail: unknown, branchName: null, now: NOW })[1].value).toBe("Cash drawer");
  });

  it("adds paid to, invoice and stock only when there is something to say, and hides Branch for one-branch stores", () => {
    const detail = detailOf({ paidFrom: "bank", shiftCashMovementId: null, paidToName: "Petron", invoiceNo: "INV-9", isStockPurchase: true }, { drawer: null });
    expect(factRows({ detail, branchName: null, now: NOW })).toEqual([
      { key: "when", label: "When", value: "Thu, 22 Oct · 10:12 AM" },
      { key: "paidFrom", label: "Paid from", value: "Bank" },
      { key: "recordedBy", label: "Recorded by", value: "Ben Santos" },
      { key: "paidTo", label: "Paid to", value: "Petron" },
      { key: "invoice", label: "Invoice no.", value: "INV-9" },
      { key: "stock", label: "Went into stock", value: "Yes, added to the stock count" },
    ]);
  });
});

describe("flagCallouts", () => {
  it("explains a missing receipt and offers the photo", () => {
    const callouts = flagCallouts({ expense: base, categories, others: [], canManage: true });
    expect(callouts).toEqual([
      {
        flag: "no_receipt",
        title: "No receipt yet",
        body: "Spends of ₱1,000 or more usually have one. Add a photo when you have it.",
        action: { kind: "add_receipt", label: "Add photo" },
      },
    ]);
  });

  it("follows the store's own receipt threshold", () => {
    const callouts = flagCallouts({ expense: { ...base, amountCents: 60_000 }, categories, others: [], canManage: true, noReceiptThresholdCents: 50_000 });
    expect(callouts[0].body).toBe("Spends of ₱500 or more usually have one. Add a photo when you have it.");
  });

  it("offers no fix to someone who cannot change the expense", () => {
    expect(flagCallouts({ expense: base, categories, others: [], canManage: false })[0].action).toBeNull();
  });

  it("points at the other one when it may be recorded twice", () => {
    const twin: Expense = { ...base, id: "e9", receiptCount: 1 };
    const withReceipt = { ...base, receiptCount: 1 };
    expect(flagCallouts({ expense: withReceipt, categories, others: [twin], canManage: false })).toEqual([
      {
        flag: "possible_duplicate",
        title: "Might be recorded twice",
        body: "Looks like another ₱1,180 Gas / LPG the same day.",
        action: { kind: "open_expense", expenseId: "e9", label: "Open the other one" },
      },
    ]);
    const dayBefore: Expense = { ...twin, spentOn: "2026-10-21" };
    expect(flagCallouts({ expense: withReceipt, categories, others: [dayBefore], canManage: true })[0].body).toBe(
      "Looks like another ₱1,180 Gas / LPG the day before.",
    );
  });

  it("never counts its own change chain as a duplicate", () => {
    const newer: Expense = { ...base, id: "e2", replacesExpenseId: "e1", receiptCount: 1 };
    expect(flagCallouts({ expense: { ...base, receiptCount: 1 }, categories, others: [newer], canManage: true })).toEqual([]);
  });

  it("says round Other amounts and after-hours voids as plain sentences", () => {
    const round = flagCallouts({ expense: { ...base, categoryId: "other", amountCents: 50_000 }, categories, others: [], canManage: true });
    expect(round.map((callout) => [callout.flag, callout.action])).toEqual([["round_other", null]]);
    expect(round[0].body).toMatch(/real category/);

    const late = flagCallouts({
      expense: { ...base, status: "void", voidedAt: "2026-10-22T15:40:00Z" },
      categories,
      others: [],
      canManage: true,
    });
    expect(late).toEqual([
      { flag: "after_hours_void", title: "Voided after hours", body: "Voided at 11:40 PM, outside the usual business day.", action: null },
    ]);
  });
});

describe("detailActions", () => {
  const open = { shiftId: "s1", drawerName: "Front till", isShiftOpen: true };
  const closed = { ...open, isShiftOpen: false };

  it("lets a manager add a receipt, change and void a drawer row on an open shift", () => {
    expect(detailActions({ canManage: true, expense: base, drawer: open })).toEqual({
      canAddReceipt: true,
      canChange: true,
      canVoid: true,
      voidNote: "Voiding puts ₱1,180 back in the drawer.",
      closedShiftNote: null,
    });
  });

  it("never voids a drawer row once its shift closed, and says why", () => {
    expect(detailActions({ canManage: true, expense: base, drawer: closed })).toMatchObject({
      canVoid: false,
      closedShiftNote: "This shift is closed, so the cash can't go back into the drawer. Use Change to fix the category instead.",
    });
    expect(detailActions({ canManage: true, expense: base, drawer: null }).canVoid).toBe(false);
  });

  it("voids a book row without a drawer note", () => {
    expect(detailActions({ canManage: true, expense: { ...base, paidFrom: "cash" }, drawer: null })).toMatchObject({
      canVoid: true,
      voidNote: null,
      closedShiftNote: null,
    });
  });

  it("offers nothing without the expenses permission or on a voided row", () => {
    const none = { canAddReceipt: false, canChange: false, canVoid: false, voidNote: null, closedShiftNote: null };
    expect(detailActions({ canManage: false, expense: base, drawer: open })).toEqual(none);
    expect(detailActions({ canManage: true, expense: { ...base, status: "void" }, drawer: open })).toEqual(none);
  });
});

describe("timelineEntries", () => {
  it("says Change, not Fix, and colours each dot by what happened", () => {
    const detail = detailOf(
      { status: "void", voidReason: "Wrong category", voidedAt: "2026-10-22T03:00:00Z", replacesExpenseId: "e0" },
      {
        replaces: { ...base, id: "e0", status: "void", voidReason: "Wrong amount", voidedAt: "2026-10-22T02:00:00Z" },
        replacedBy: { ...base, id: "e3", createdAt: "2026-10-22T03:00:00Z" },
      },
    );
    expect(timelineEntries(detail, NOW)).toEqual([
      { key: "replaces", text: "Changed from an earlier version (Wrong amount)", when: "Today · 10:00 AM", linkExpenseId: "e0", tone: "neutral" },
      { key: "recorded", text: "Recorded by Ben Santos from the Front till drawer", when: "Today · 10:12 AM", linkExpenseId: null, tone: "good" },
      { key: "voided", text: "Voided: Wrong category", when: "Today · 11:00 AM", linkExpenseId: null, tone: "danger" },
      { key: "replacedBy", text: "Changed — see the new version", when: "Today · 11:00 AM", linkExpenseId: "e3", tone: "neutral" },
    ]);
  });
});

describe("receipts", () => {
  const receipts = [
    { id: "r1", mime: "image/jpeg", createdAt: "2026-10-22T02:13:00Z" },
    { id: "r2", mime: "application/pdf", createdAt: "2026-10-22T02:14:00Z" },
    { id: "r3", mime: "image/png", createdAt: "2026-10-22T02:15:00Z" },
  ];

  it("lists uploaded receipts in order, then the ones still on this phone", () => {
    const tiles = receiptTiles(receipts, { r1: "https://signed/1", r3: null }, [
      { id: "q1", fileUri: "file:///q1.jpg", mime: "image/jpeg" },
      { id: "q2", fileUri: "file:///q2.pdf", mime: "application/pdf" },
    ]);
    expect(tiles).toEqual([
      { key: "r1", kind: "photo", receiptId: "r1", uri: "https://signed/1" },
      { key: "r2", kind: "pdf", receiptId: "r2" },
      { key: "r3", kind: "photo", receiptId: "r3", uri: null },
      { key: "q1", kind: "waiting", uri: "file:///q1.jpg", isPdf: false, refusedReason: null },
      { key: "q2", kind: "waiting", uri: "file:///q2.pdf", isPdf: true, refusedReason: null },
    ]);
  });

  it("keeps a photo the server refused on screen, with why, so it can be tried again or removed", () => {
    const tiles = receiptTiles([], {}, [
      { id: "q1", fileUri: "file:///q1.jpg", mime: "image/jpeg", refusedReason: "This file is too big. Take the photo again." },
    ]);
    expect(tiles).toEqual([
      { key: "q1", kind: "waiting", uri: "file:///q1.jpg", isPdf: false, refusedReason: "This file is too big. Take the photo again." },
    ]);
  });

  it("gives the viewer every photo it can draw, in the same order", () => {
    const tiles = receiptTiles(receipts, { r1: "https://signed/1", r3: "https://signed/3" }, [
      { id: "q1", fileUri: "file:///q1.jpg", mime: "image/jpeg" },
    ]);
    expect(viewerItems(tiles)).toEqual([
      { key: "r1", uri: "https://signed/1", isWaiting: false },
      { key: "r3", uri: "https://signed/3", isWaiting: false },
      { key: "q1", uri: "file:///q1.jpg", isWaiting: true },
    ]);
  });
});

describe("detailAccess", () => {
  it("opens everything for an account with the expenses key", () => {
    expect(detailAccess({ canManage: true, expense: { ...base, paidFrom: "bank" } })).toBe("full");
    expect(detailAccess({ canManage: true, expense: null })).toBe("full");
  });

  it("lets a cashier read a drawer expense (the database only returns their own), with no owner actions", () => {
    expect(detailAccess({ canManage: false, expense: base })).toBe("own_drawer");
  });

  it("locks a non-drawer row or a row that did not come back for an account without the key", () => {
    expect(detailAccess({ canManage: false, expense: { ...base, paidFrom: "gcash" } })).toBe("locked");
    expect(detailAccess({ canManage: false, expense: null })).toBe("locked");
  });
});

describe("duplicate rule matches the Expenses list", () => {
  it("flags exactly what 'Check these' flags when given the same month's rows", () => {
    // Arrange: the month as Home reads it.
    const month: Expense[] = [
      { ...base, id: "a", paidFrom: "cash", spentOn: "2026-10-20" },
      { ...base, id: "b", paidFrom: "cash", spentOn: "2026-10-21" },
      { ...base, id: "c", paidFrom: "cash", spentOn: "2026-10-01", amountCents: 50_000 },
      { ...base, id: "d", paidFrom: "cash", spentOn: "2026-10-05", categoryId: "other", amountCents: 50_000, receiptCount: 1 },
    ];
    const asListed = computeFlagsForAll(month, { categories });

    // Act + Assert
    for (const expense of month) {
      const shown = flagCallouts({ expense, categories, others: month, canManage: true }).map((callout) => callout.flag);
      expect(shown).toEqual(asListed[expense.id]);
    }
  });
});

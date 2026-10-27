import { parseDayCloseRecord, parseDayCloseStatus, parseSnapshot } from "./day-close";
import { SNAPSHOT } from "./day-close.fixture";
import {
  closeNoteOf,
  closeTitle,
  skippedOf,
  heroOf,
  historyRowOf,
  overShortWord,
  periodRowsOf,
  readyToClose,
  recountLinesOf,
  shiftRowsOf,
  slipInputOf,
  windowLine,
} from "./day-close-view";

const snap = parseSnapshot(SNAPSHOT)!;

describe("day close words", () => {
  it("names the day and its window", () => {
    expect(closeTitle("2026-10-24")).toBe("Close Saturday");
    expect(closeTitle("2026-10-23")).toBe("Close Friday");
    expect(windowLine("2026-10-23", "2026-10-22T20:00:00.000Z", "2026-10-23T20:00:00.000Z")).toBe("Oct 23 · Fri 4:00 AM – Sat 3:59 AM");
  });

  it("short/over is a word, unknown is nothing", () => {
    expect(overShortWord(-12000)).toBe("Short ₱120");
    expect(overShortWord(500)).toBe("Over ₱5");
    expect(overShortWord(0)).toBe("Exact");
    expect(overShortWord(null)).toBeNull();
  });

  it("the hero says cash to deposit and the lines behind it", () => {
    const hero = heroOf(snap);
    expect(hero.cashToDeposit).toBe("₱8,845");
    expect(hero.lines).toEqual([
      { label: "Net sales", value: "₱41,220" },
      { label: "Cash", value: "₱24,615" },
      { label: "GCash", value: "₱9,840" },
      { label: "Expenses from drawer", value: "−₱600" },
      { label: "Short / over", value: "−₱120" },
      { label: "Floats kept for tomorrow", value: "₱2,000" },
    ]);
    expect(heroOf({ ...snap, cashToAccountForCents: null }).cashToDeposit).toBe("Not known");
  });

  it("drawers-only stores show no sales lines (never ₱0)", () => {
    expect(heroOf({ ...snap, sales: null }).lines.map((l) => l.label)).not.toContain("Net sales");
    expect(periodRowsOf({ ...snap, sales: null })).toEqual([]);
  });

  it("by shift, by named shift, and recounts", () => {
    expect(shiftRowsOf(snap)).toEqual([
      { key: "s1", title: "Ana · Cashier 1", detail: "Remitted ₱6,345 · Short ₱120" },
      { key: "s2", title: "Ben · Cashier 2", detail: "Ended by a manager · not counted" },
    ]);
    expect(periodRowsOf(snap).map((r) => r.title)).toEqual(["Day shift", "Night shift", "Other hours"]);
    expect(recountLinesOf(snap)).toEqual(["Ana counted twice: ₱0 → ₱8,345"]);
  });
});

describe("readyToClose", () => {
  const status = (patch: Record<string, unknown>) =>
    parseDayCloseStatus({ businessDay: "2026-10-23", cutoffMinutes: 240, openShifts: [], pendingRemittances: [], nonCashUnchecked: [], existingClose: null, preview: SNAPSHOT, ...patch });

  it("says the day is ready once every shift ended", () => {
    expect(readyToClose(status({}))).toEqual({ title: "Friday is ready to close", detail: "2 shifts ended · ₱8,845 to deposit" });
  });

  it("is quiet while a shift is open, once closed, or on a day with no shifts", () => {
    expect(readyToClose(status({ openShifts: [{ shiftId: "s", staffName: "C", openedAt: "x" }] }))).toBeNull();
    expect(readyToClose(status({ existingClose: { id: "c", version: 1, status: "closed", closedAt: "x", closedByName: "L" } }))).toBeNull();
    expect(readyToClose(status({ preview: { ...SNAPSHOT, drawers: { shifts: [], totals: {} } } }))).toBeNull();
  });
});

describe("history and slip", () => {
  const record = parseDayCloseRecord({
    id: "c1",
    business_day: "2026-10-23",
    version: 1,
    status: "closed",
    snapshot: SNAPSHOT,
    closed_by_name: "Lorna",
    closed_at: "2026-10-23T20:30:00.000Z",
    deposit_cents: 884500,
    deposit_to: "BDO",
    deposit_recorded_at: "2026-10-24T01:00:00.000Z",
  });

  it("history rows say the deposit, the result and who closed", () => {
    expect(historyRowOf(record)).toEqual({ key: "c1", title: "Friday, Oct 23", detail: "Deposited ₱8,845 · Short ₱120 · closed by Lorna" });
    expect(historyRowOf({ ...record, deposit: null }).detail).toMatch(/^Deposit not recorded/);
    expect(historyRowOf({ ...record, status: "reopened", reopen: { byName: "Lorna", at: "x", reason: "Missed GCash" } }).detail).toBe(
      "Reopened by Lorna: Missed GCash",
    );
  });

  it("feeds the shared DAY CLOSE slip", () => {
    const slip = slipInputOf(record, ["1 remittance not settled"])!;
    expect(slip).toMatchObject({ businessDay: "2026-10-23", cashToDepositCents: 884500, differenceCents: -12000, floatsKeptCents: 200000 });
    expect(slip.shifts[1]).toMatchObject({ closeKind: "forced", handedOverCents: null });
    expect(slip.deposit).toEqual({ cents: 884500, to: "BDO", ref: null });
    expect(slip.skipped).toEqual(["1 remittance not settled"]);
  });
});

describe("skipped and the close note", () => {
  it("says what a saved close skipped", () => {
    const rec = parseDayCloseRecord({ id: "c", business_day: "2026-10-23", unsettled_remittance_ids: ["a", "b"], forced_shift_ids: ["s"] });
    expect(skippedOf(rec)).toEqual(["2 remittances not settled", "1 shift ended without a count"]);
  });

  it("puts what was skipped into the note sent with Close anyway", () => {
    expect(closeNoteOf("  Maria off today ", ["1 remittance not settled"])).toBe("Maria off today · Closed with: 1 remittance not settled");
    expect(closeNoteOf("", [])).toBeNull();
    expect(closeNoteOf("", ["GCash not checked on Ana's shift"])).toBe("Closed with: GCash not checked on Ana's shift");
  });
});

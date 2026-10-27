
import {
  canLeaveResult,
  canRecount,
  isCountLocked,
  startRecount,
  withCount,
  canRemit,
  canSubmitCount,
  checkFloatKept,
  countedCentsOf,
  draftStorageKey,
  emptyDraft,
  END_SHIFT_COPY,
  floatToKeep,
  handoverCents,
  nextStep,
  parseDraft,
  previousStep,
  serializeDraft,
  stepsFor,
} from "./shift-end-flow";
import type { NonCashMethod, ShiftCountResult } from "./shift-close-parse";

const GCASH: NonCashMethod = { key: "gcash", label: "GCash", cents: 421000, count: 14 };

describe("counting", () => {
  it("adds bills and coins in centavos, and reads nothing typed as not counted", () => {
    const draft = emptyDraft("s1", "bills");
    expect(countedCentsOf(draft)).toBeNull();
    expect(countedCentsOf({ ...draft, counts: { b1000: 4, b500: 3, c025: 4 } })).toBe(550100);
    expect(countedCentsOf({ ...draft, mode: "total", typedCents: 834500 })).toBe(834500);
  });

  it("counts a deliberately empty drawer once a row was touched", () => {
    expect(countedCentsOf({ ...emptyDraft("s1", "bills"), counts: { b1000: 0 } })).toBe(0);
  });
});

describe("steps", () => {
  it("drops GCash & cards when no non-cash came in", () => {
    expect(stepsFor(null)).toEqual(["count", "result", "remit"]);
    expect(stepsFor([{ ...GCASH, cents: 0, count: 0 }])).toEqual(["count", "result", "remit"]);
    expect(stepsFor([GCASH])).toEqual(["count", "noncash", "result", "remit"]);
  });

  it("walks forward and back within the steps it has", () => {
    const steps = stepsFor(null);
    expect(nextStep(steps, "count")).toBe("result");
    expect(previousStep(steps, "result")).toBe("count");
    expect(nextStep(steps, "remit")).toBeNull();
    expect(previousStep(steps, "count")).toBeNull();
  });
});

describe("float and handover", () => {
  it("keeps the shift's float for the next one, never more than is there", () => {
    expect(floatToKeep({ openingFloatCents: 200000, isZeroBalance: false, countedCents: 834500, chosenCents: null })).toBe(200000);
    expect(floatToKeep({ openingFloatCents: 200000, isZeroBalance: false, countedCents: 150000, chosenCents: null })).toBe(150000);
    expect(floatToKeep({ openingFloatCents: 200000, isZeroBalance: false, countedCents: 834500, chosenCents: 300000 })).toBe(300000);
  });

  it("empties a zero-balance drawer", () => {
    expect(floatToKeep({ openingFloatCents: 0, isZeroBalance: true, countedCents: 834500, chosenCents: 100000 })).toBe(0);
  });

  it("remits what is counted less the float kept", () => {
    expect(handoverCents(834500, 200000)).toBe(634500);
    expect(handoverCents(100000, 200000)).toBe(0);
  });

  it("refuses keeping more than was counted", () => {
    expect(checkFloatKept(900000, 834500)).toMatch(/more than you counted/);
    expect(checkFloatKept(200000, 834500)).toBeNull();
  });
});

describe("gates", () => {
  const ready = { isOffline: false, pendingSales: 0, waitingExpenses: 0, countedCents: 834500 };

  it("sends a count only online, with nothing waiting to sync", () => {
    expect(canSubmitCount(ready)).toEqual({ ok: true });
    expect(canSubmitCount({ ...ready, countedCents: null })).toEqual({ ok: false, reason: END_SHIFT_COPY.nothingCounted });
    expect(canSubmitCount({ ...ready, isOffline: true })).toEqual({ ok: false, reason: END_SHIFT_COPY.offlineCount });
    expect(canSubmitCount({ ...ready, pendingSales: 2 })).toEqual({ ok: false, reason: "2 sales are still waiting to sync. Connect to the internet, then count." });
    expect(canSubmitCount({ ...ready, waitingExpenses: 1 })).toMatchObject({ ok: false });
  });

  it("needs a reason when the server asks for one", () => {
    const count: ShiftCountResult = { attempt: 1, countedCents: 834500, expectedCents: 846500, differenceCents: -12000, source: "server", reasonRequired: true };
    expect(canLeaveResult(count, null)).toEqual({ ok: false, reason: END_SHIFT_COPY.pickReason });
    expect(canLeaveResult(count, "wrong_change")).toEqual({ ok: true });
    expect(canLeaveResult({ ...count, reasonRequired: false }, null)).toEqual({ ok: true });
  });

  it("remits only online, to someone when the store requires it", () => {
    expect(canRemit({ isOffline: true, isTargetReady: true, remittanceMode: "required" })).toEqual({ ok: false, reason: END_SHIFT_COPY.offlineRemit });
    expect(canRemit({ isOffline: false, isTargetReady: false, remittanceMode: "required" })).toEqual({ ok: false, reason: END_SHIFT_COPY.pickReceiver });
    expect(canRemit({ isOffline: false, isTargetReady: false, remittanceMode: "optional" })).toEqual({ ok: true });
    expect(canRemit({ isOffline: false, isTargetReady: false, remittanceMode: "off" })).toEqual({ ok: true });
    expect(canRemit({ isOffline: false, isTargetReady: true, remittanceMode: "required" })).toEqual({ ok: true });
  });
});

describe("count lock", () => {
  const first: ShiftCountResult = { attempt: 1, countedCents: 834500, expectedCents: 846500, differenceCents: -12000, source: "server", reasonRequired: true };

  it("locks a count once the server has it, and opens it once for a recount", () => {
    const sent = withCount(emptyDraft("s1", "bills"), first);
    expect(isCountLocked(sent)).toBe(true);
    expect(canRecount(sent)).toBe(true);
    const recounting = startRecount({ ...sent, step: "result", reasonKey: "wrong_change" });
    expect(recounting).toMatchObject({ isRecounting: true, step: "count", reasonKey: null });
    expect(isCountLocked(recounting)).toBe(false);
  });

  it("offers no second recount", () => {
    const second = withCount(emptyDraft("s1", "bills"), { ...first, attempt: 2 });
    expect(canRecount(second)).toBe(false);
    expect(startRecount(second)).toBe(second);
  });
});

describe("draft", () => {
  it("round-trips a draft for its own shift", () => {
    const draft = {
      ...emptyDraft("s1", "bills"),
      nonCash: [{ key: "gcash", label: "GCash", expectedCents: 421000, count: 14, check: "matches" as const, declaredCents: null, note: "" }],
      counts: { b100: 7 },
      reasonKey: "wrong_change" as const,
      step: "result" as const,
      count: { attempt: 1 as const, countedCents: 70000, expectedCents: 70000, differenceCents: 0, source: "server" as const, reasonRequired: false },
    };
    expect(parseDraft(serializeDraft(draft), "s1")).toEqual(draft);
  });

  it("ignores a draft for another shift, garbage, or bad counts", () => {
    const raw = serializeDraft(emptyDraft("s1", "bills"));
    expect(parseDraft(raw, "s2")).toBeNull();
    expect(parseDraft("{nope", "s1")).toBeNull();
    expect(parseDraft(null, "s1")).toBeNull();
    expect(parseDraft(raw.replace('"counts":{}', '"counts":{"b100":-1}'), "s1")).toBeNull();
  });

  it("keys drafts by store and shift", () => {
    expect(draftStorageKey("t1", "s1")).not.toBe(draftStorageKey("t2", "s1"));
  });
});

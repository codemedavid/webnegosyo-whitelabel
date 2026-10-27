import {
  CUTOFF_CHIPS,
  cashRulesAccess,
  changeSentence,
  cutoffChipLabel,
  describeStartsFrom,
  diffCashRules,
  isChipCutoff,
  pendingCutoff,
  receiversOf,
  rulesPatch,
  stepCutoff,
  stepThreshold,
} from "./rules-form";
import { DEFAULT_CASH_SETTINGS, VARIANCE_REASON_MAX_CENTS } from "./settings";

describe("business day chips", () => {
  it("offer midnight to 6 AM by the hour", () => {
    expect(CUTOFF_CHIPS).toEqual([0, 60, 120, 180, 240, 300, 360]);
    expect(CUTOFF_CHIPS.map(cutoffChipLabel)).toEqual(["12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM"]);
    expect(isChipCutoff(240)).toBe(true);
    expect(isChipCutoff(255)).toBe(false);
  });

  it("'Other' moves in 15-minute steps and stops at 12:00 AM and 11:45 AM", () => {
    expect(stepCutoff(240, 1)).toBe(255);
    expect(stepCutoff(0, -1)).toBe(0);
    expect(stepCutoff(705, 1)).toBe(705);
  });
});

describe("describeStartsFrom", () => {
  it("names the first day the new cutoff applies to", () => {
    expect(describeStartsFrom("2026-10-25")).toBe("Starts from Sunday, Oct 25. Past days keep their dates.");
    expect(describeStartsFrom("2026-10-24")).toBe("Starts from Saturday, Oct 24. Past days keep their dates.");
  });
});

describe("pendingCutoff", () => {
  it("finds a change that has not started yet", () => {
    const schedule = [
      { effectiveFrom: "2026-01-01", cutoffMinutes: 120 },
      { effectiveFrom: "2026-10-28", cutoffMinutes: 240 },
    ];
    expect(pendingCutoff(schedule, "2026-10-27")).toEqual({ effectiveFrom: "2026-10-28", cutoffMinutes: 240 });
    expect(pendingCutoff(schedule, "2026-10-28")).toBeNull();
    expect(pendingCutoff([], "2026-10-27")).toBeNull();
  });
});

describe("reason threshold stepper", () => {
  it("moves by ₱10 and stays within ₱0 and the ceiling", () => {
    expect(stepThreshold(2000, 1)).toBe(3000);
    expect(stepThreshold(2000, -1)).toBe(1000);
    expect(stepThreshold(500, -1)).toBe(0);
    expect(stepThreshold(VARIANCE_REASON_MAX_CENTS, 1)).toBe(VARIANCE_REASON_MAX_CENTS);
  });
});

describe("diffCashRules / rulesPatch", () => {
  it("lists only what changed, in words", () => {
    const draft = { ...DEFAULT_CASH_SETTINGS, blindClose: true, varianceReasonFromCents: 5000, remittanceMode: "required" as const };
    const changes = diffCashRules(DEFAULT_CASH_SETTINGS, draft);
    expect(changes.map(changeSentence)).toEqual([
      "Blind count: Off → On",
      "Ask for a reason above: ₱20 → ₱50",
      "Remittances: Optional → Required",
    ]);
    expect(rulesPatch(DEFAULT_CASH_SETTINGS, draft)).toEqual({
      blindClose: true,
      varianceReasonFromCents: 5000,
      remittanceMode: "required",
    });
  });

  it("is empty when nothing changed", () => {
    expect(diffCashRules(DEFAULT_CASH_SETTINGS, { ...DEFAULT_CASH_SETTINGS })).toEqual([]);
  });
});

describe("receiversOf", () => {
  it("is the owner and everyone who holds cash_manage, owner first (legacy full access does not: opt-in)", () => {
    const staff = [
      { userId: "c", isOwner: false, permissions: ["pos"], displayName: "Carlo", outletId: null },
      { userId: "m", isOwner: false, permissions: ["cash_manage", "pos"], displayName: "Maria", outletId: "b1" },
      { userId: "o", isOwner: true, permissions: null, displayName: "Lorna", outletId: null },
      { userId: "f", isOwner: false, permissions: null, displayName: null, outletId: null },
    ];
    expect(receiversOf(staff).map((s) => s.userId)).toEqual(["o", "m"]);
  });
});

describe("cashRulesAccess", () => {
  const base = { role: "admin", isOwner: false, permissions: [] as string[] | null, outletId: null, isDemo: false };

  it("gives the owner everything", () => {
    expect(cashRulesAccess({ ...base, isOwner: true })).toEqual({ canOpen: true, canEditRules: true, canEditCutoff: true });
  });

  it("lets a cash manager change the cash rules but not the business day", () => {
    expect(cashRulesAccess({ ...base, permissions: ["cash_manage"] })).toEqual({
      canOpen: true,
      canEditRules: true,
      canEditCutoff: false,
    });
  });

  it("lets a Settings holder change only the business day", () => {
    expect(cashRulesAccess({ ...base, permissions: ["settings"] })).toEqual({
      canOpen: true,
      canEditRules: false,
      canEditCutoff: true,
    });
  });

  it("keeps the screen from a cashier and from any branch-locked account", () => {
    expect(cashRulesAccess({ ...base, permissions: ["pos"] }).canOpen).toBe(false);
    expect(cashRulesAccess({ ...base, permissions: ["cash_manage"], outletId: "b1" }).canOpen).toBe(false);
  });

  it("is read-only in demo", () => {
    expect(cashRulesAccess({ ...base, isOwner: true, isDemo: true })).toEqual({
      canOpen: true,
      canEditRules: false,
      canEditCutoff: false,
    });
  });
});

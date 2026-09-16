import {
  describeProgramRules,
  describeReward,
  EMPTY_FORM,
  nextStatusAction,
  parseProgramForm,
} from "./programs";

describe("describeReward / describeProgramRules", () => {
  it("phrases each reward type", () => {
    expect(describeReward({ type: "fixed", amount: 50 })).toBe("₱50 off");
    expect(describeReward({ type: "percent", percent: 10, maxAmount: 200 })).toBe("10% off (up to ₱200)");
    expect(describeReward({ type: "free_item", menuItemId: "x", itemName: "Latte" })).toBe("Free Latte");
  });

  it("phrases stamp and points programs", () => {
    expect(
      describeProgramRules({ earnMode: "stamp", threshold: 10, pointsPerPeso: null, minSpend: null, reward: { type: "fixed", amount: 50 }, rewardExpiryDays: null, isExclusive: true }),
    ).toBe("Every 10 orders → ₱50 off");
    expect(
      describeProgramRules({ earnMode: "points", threshold: 500, pointsPerPeso: 1, minSpend: 150, reward: { type: "percent", percent: 10 }, rewardExpiryDays: null, isExclusive: true }),
    ).toBe("Every 500 points (1 pt per ₱), orders of ₱150+ → 10% off");
    expect(describeProgramRules(null)).toBe("Rules not set");
  });
});

describe("nextStatusAction", () => {
  it("offers exactly one move per state and none once ended", () => {
    expect(nextStatusAction("draft")).toEqual({ label: "Activate", to: "active" });
    expect(nextStatusAction("active")).toEqual({ label: "Pause", to: "paused" });
    expect(nextStatusAction("paused")).toEqual({ label: "Resume", to: "active" });
    expect(nextStatusAction("ended")).toBeNull();
  });
});

describe("parseProgramForm", () => {
  it("saves a selected free item, branch, and reward expiry", () => {
    const parsed = parseProgramForm({ ...EMPTY_FORM, name: "North coffee", scope: "branch", outletId: "north", rewardType: "free_item", rewardItemId: "latte", rewardItemName: "Latte", rewardExpiryDays: "30" });
    expect(parsed).toMatchObject({ ok: true, program: { scope: "branch", outletId: "north", rules: { reward: { type: "free_item", menuItemId: "latte", itemName: "Latte" }, rewardExpiryDays: 30 } } });
  });
  it("turns a filled stamp form into platform rules", () => {
    const parsed = parseProgramForm({ ...EMPTY_FORM, name: "Coffee card", rewardValue: "50" });
    expect(parsed.ok && parsed.program).toEqual({
      name: "Coffee card",
      scope: "business",
      rules: {
        earnMode: "stamp", threshold: 10, pointsPerPeso: null, minSpend: null,
        reward: { type: "fixed", amount: 50 }, rewardExpiryDays: null, isExclusive: true,
      },
    });
  });

  it("carries the points rate and a capped percent reward", () => {
    const parsed = parseProgramForm({ ...EMPTY_FORM, name: "Points", earnMode: "points", threshold: "500", pointsPerPeso: "2", rewardType: "percent", rewardValue: "10", rewardCap: "200" });
    expect(parsed.ok && parsed.program.rules).toMatchObject({ pointsPerPeso: 2, reward: { type: "percent", percent: 10, maxAmount: 200 } });
  });

  it.each([
    ["a blank name", { ...EMPTY_FORM, rewardValue: "50" }],
    ["a zero threshold", { ...EMPTY_FORM, name: "x", threshold: "0", rewardValue: "50" }],
    ["a points program without a rate", { ...EMPTY_FORM, name: "x", earnMode: "points" as const, pointsPerPeso: "", rewardValue: "50" }],
    ["a reward worth nothing", { ...EMPTY_FORM, name: "x", rewardValue: "" }],
    ["a percent over 100", { ...EMPTY_FORM, name: "x", rewardType: "percent" as const, rewardValue: "150" }],
  ])("refuses %s", (_label, form) => {
    expect(parseProgramForm(form).ok).toBe(false);
  });
});

import {
  describeProgramRules,
  programToForm,
  rewardSteps,
  EMPTY_REWARD,
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

const FIXED_50 = { ...EMPTY_REWARD, type: "fixed" as const, value: "50" };
const LATTE = { ...EMPTY_REWARD, type: "free_item" as const, itemId: "latte", itemName: "Latte", imageUrl: "https://img/latte.jpg", emoji: "☕" };

describe("parseProgramForm", () => {
  it("saves a selected free item, branch, and reward expiry", () => {
    const parsed = parseProgramForm({ ...EMPTY_FORM, name: "North coffee", scope: "branch", outletId: "north", reward: LATTE, rewardExpiryDays: "30" });
    expect(parsed).toMatchObject({ ok: true, program: { scope: "branch", outletId: "north", rules: { reward: { type: "free_item", menuItemId: "latte", itemName: "Latte", emoji: "☕" }, rewardExpiryDays: 30 } } });
  });

  it("turns a filled stamp form into platform rules", () => {
    const parsed = parseProgramForm({ ...EMPTY_FORM, name: "Coffee card", reward: FIXED_50 });
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
    const parsed = parseProgramForm({ ...EMPTY_FORM, name: "Points", earnMode: "points", threshold: "500", pointsPerPeso: "2", reward: { ...EMPTY_REWARD, type: "percent", value: "10", cap: "200" } });
    expect(parsed.ok && parsed.program.rules).toMatchObject({ pointsPerPeso: 2, reward: { type: "percent", percent: 10, maxAmount: 200 } });
  });

  it("puts every rung on the card in order", () => {
    const parsed = parseProgramForm({
      ...EMPTY_FORM, name: "Ladder", reward: LATTE,
      milestones: [{ at: 7, reward: FIXED_50 }, { at: 3, reward: { ...LATTE, emoji: "🥤" } }],
    });
    expect(parsed.ok && parsed.program.rules.milestones).toEqual([
      { at: 3, reward: { type: "free_item", menuItemId: "latte", itemName: "Latte", imageUrl: "https://img/latte.jpg", emoji: "🥤" } },
      { at: 7, reward: { type: "fixed", amount: 50 } },
    ]);
  });

  it.each([
    ["a blank name", { ...EMPTY_FORM, reward: FIXED_50 }],
    ["a zero threshold", { ...EMPTY_FORM, name: "x", threshold: "0", reward: FIXED_50 }],
    ["a points program without a rate", { ...EMPTY_FORM, name: "x", earnMode: "points" as const, pointsPerPeso: "", reward: FIXED_50 }],
    ["a reward worth nothing", { ...EMPTY_FORM, name: "x" }],
    ["a percent over 100", { ...EMPTY_FORM, name: "x", reward: { ...EMPTY_REWARD, type: "percent" as const, value: "150" } }],
    ["a free item with no item", { ...EMPTY_FORM, name: "x", reward: { ...EMPTY_REWARD, type: "free_item" as const } }],
    ["a rung at the last stamp", { ...EMPTY_FORM, name: "x", reward: FIXED_50, milestones: [{ at: 10, reward: FIXED_50 }] }],
    ["a rung with an empty reward", { ...EMPTY_FORM, name: "x", reward: FIXED_50, milestones: [{ at: 4, reward: EMPTY_REWARD }] }],
  ])("refuses %s", (_label, form) => {
    expect(parseProgramForm(form).ok).toBe(false);
  });

  it("names the stamp of a broken rung", () => {
    const parsed = parseProgramForm({ ...EMPTY_FORM, name: "x", reward: FIXED_50, milestones: [{ at: 4, reward: EMPTY_REWARD }] });
    expect(!parsed.ok && parsed.error).toMatch(/stamp 4/);
  });
});

describe("programToForm", () => {
  it("round-trips a ladder without dropping photos or icons", () => {
    const rules = {
      earnMode: "stamp" as const, threshold: 10, pointsPerPeso: null, minSpend: null, rewardExpiryDays: null, isExclusive: true,
      reward: { type: "free_item" as const, menuItemId: "latte", itemName: "Latte", imageUrl: "https://img/latte.jpg", emoji: "☕" },
      milestones: [{ at: 5, reward: { type: "fixed" as const, amount: 20, emoji: "💸" } }],
    };
    const form = programToForm({
      id: "p", name: "Coffee", description: null, earnMode: "stamp", scope: "business", outletId: null, status: "active",
      activatesAt: null, endsAt: null, versionNumber: 1, rules, members: 0, rewardsOutstanding: 0, createdAt: "",
    });
    const parsed = parseProgramForm(form);
    expect(parsed.ok && parsed.program.rules).toEqual(rules);
  });
});

describe("rewardSteps", () => {
  it("lists the rungs with an icon for each, the card reset last", () => {
    expect(rewardSteps({
      earnMode: "stamp", threshold: 10, pointsPerPeso: null, minSpend: null, rewardExpiryDays: null, isExclusive: true,
      reward: { type: "fixed", amount: 100 },
      milestones: [{ at: 5, reward: { type: "free_item", menuItemId: "t", itemName: "Iced Tea", emoji: "🥤" } }],
    })).toEqual([
      { at: 5, label: "Free Iced Tea", emoji: "🥤", imageUrl: null, isFinal: false },
      { at: 10, label: "₱100 off", emoji: "💸", imageUrl: null, isFinal: true },
    ]);
  });
});

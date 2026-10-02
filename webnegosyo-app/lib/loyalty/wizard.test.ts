import { EMPTY_FORM, EMPTY_REWARD, parseProgramForm, type ProgramForm } from "./programs";
import {
  CREATE_STEPS,
  EDIT_STEPS,
  PROGRAM_TEMPLATES,
  applyTemplate,
  cardSlots,
  placeReward,
  removeReward,
  resizeCard,
  rewardAt,
  previewSteps,
  stepIssue,
} from "./wizard";

const TEA = { ...EMPTY_REWARD, type: "free_item" as const, itemId: "tea", itemName: "Iced Tea", emoji: "🥤" };
const MEAL = { ...EMPTY_REWARD, type: "free_item" as const, itemId: "meal", itemName: "Meal", emoji: "🍔" };
const base: ProgramForm = { ...EMPTY_FORM, name: "Club", threshold: "10", reward: MEAL };

describe("steps", () => {
  it("skips choosing a style when editing — the program already has one", () => {
    expect(CREATE_STEPS[0]).toBe("style");
    expect(EDIT_STEPS).not.toContain("style");
    expect(CREATE_STEPS[CREATE_STEPS.length - 1]).toBe("review");
  });
});

describe("templates", () => {
  it("every template opens on a card the next steps can finish", () => {
    for (const template of PROGRAM_TEMPLATES) {
      const form = applyTemplate(template);
      expect(stepIssue(form, "size")).toBeNull();
      expect(form.milestones.every((m) => m.at < Number(form.threshold))).toBe(true);
    }
  });

  it("the ladder template puts a reward half way along the card", () => {
    const ladder = applyTemplate(PROGRAM_TEMPLATES.find((t) => t.id === "ladder")!);
    expect(ladder.milestones.map((m) => m.at)).toEqual([5]);
  });
});

describe("placing rewards", () => {
  it("puts a reward on a middle slot without touching the big one", () => {
    const form = placeReward(base, 5, TEA);
    expect(rewardAt(form, 5)).toEqual(TEA);
    expect(form.reward).toEqual(MEAL);
    expect(base.milestones).toEqual([]);
  });

  it("the last slot is the big reward", () => {
    expect(placeReward(base, 10, TEA).reward).toEqual(TEA);
  });

  it("replaces the reward already on a slot", () => {
    const form = placeReward(placeReward(base, 5, TEA), 5, MEAL);
    expect(form.milestones).toEqual([{ at: 5, reward: MEAL }]);
  });

  it("removes a middle reward but never the big one", () => {
    const form = placeReward(base, 5, TEA);
    expect(removeReward(form, 5).milestones).toEqual([]);
    expect(removeReward(form, 10)).toBe(form);
  });

  it("shrinking the card drops rewards that fall off its end", () => {
    const form = resizeCard(placeReward(placeReward(base, 3, TEA), 8, TEA), 6);
    expect(form.threshold).toBe("6");
    expect(form.milestones.map((m) => m.at)).toEqual([3]);
  });

  it("a placed ladder saves", () => {
    const parsed = parseProgramForm(placeReward(base, 5, TEA));
    expect(parsed.ok && parsed.program.rules.milestones?.[0].at).toBe(5);
  });
});

describe("cardSlots", () => {
  it("numbers every slot, marks rewards, and fills from the left", () => {
    const slots = cardSlots(placeReward({ ...base, threshold: "4" }, 2, TEA), 3);
    expect(slots.map((s) => [s.at, s.reward?.itemName ?? null, s.isFilled])).toEqual([
      [1, null, true],
      [2, "Iced Tea", true],
      [3, null, true],
      [4, "Meal", false],
    ]);
  });
});

describe("stepIssue", () => {
  it.each([
    ["a card too short", { ...base, threshold: "1" }, "size"],
    ["a card too long", { ...base, threshold: "40" }, "size"],
    ["a big reward not chosen", { ...base, reward: EMPTY_REWARD }, "rewards"],
    ["a middle reward left empty", { ...base, milestones: [{ at: 4, reward: EMPTY_REWARD }] }, "rewards"],
    ["no name", { ...base, name: " " }, "details"],
  ] as const)("stops on %s", (_label, form, step) => {
    expect(stepIssue(form as ProgramForm, step)).not.toBeNull();
  });

  it("lets a points card be long", () => {
    expect(stepIssue({ ...base, earnMode: "points", threshold: "500" }, "size")).toBeNull();
  });
});

describe("previewSteps", () => {
  it("draws unfinished rewards as a prompt, finished ones in customer words", () => {
    const form = placeReward({ ...base, reward: { ...EMPTY_REWARD, type: "fixed", value: "50" } }, 5, { ...EMPTY_REWARD, type: "free_item", emoji: "🥤" });
    expect(previewSteps(form)).toEqual([
      { at: 5, label: "Pick a menu item", emoji: "🥤", imageUrl: null, isFinal: false },
      { at: 10, label: "₱50 off", emoji: "💸", imageUrl: null, isFinal: true },
    ]);
  });
});

it("an unfinished reward without an icon falls back to its type's icon", () => {
  const steps = previewSteps({ ...base, reward: { ...EMPTY_REWARD, type: "percent" } });
  expect(steps[0].emoji).toBe("🏷️");
});

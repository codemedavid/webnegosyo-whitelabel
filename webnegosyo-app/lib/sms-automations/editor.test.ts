import {
  canStep,
  draftFromAutomation,
  draftFromRecipe,
  insertWord,
  isDraftDirty,
  knobValue,
  messageLanguage,
  messageProblem,
  minOrderOptions,
  stepKnob,
  toApiDraft, audienceKey } from "./editor";
import type { Automation, RecipeInfo } from "./api";

const WIN_BACK: RecipeInfo = {
  id: "win_back", moment: "bring_back", title: "We miss you", pitch: "p", defaults: { inactiveDays: 30 },
  limits: { inactiveDays: [7, 365] }, defaultReentryDays: 60, needsLoyalty: false, needsReviewLink: false,
  defaultMessage: "Hi {{firstName}}, we miss you at {{storeName}}!", defaultMessageTl: "Hi {{firstName}}, miss ka na namin!",
  variables: ["firstName", "storeName", "menuLink"], description: "d",
};
const REVIEW: RecipeInfo = {
  ...WIN_BACK, id: "review_request", defaults: { delayHours: 3, minOrderCount: 2 },
  limits: { delayHours: [1, 72], minOrderCount: [1, 10] },
};
const QUIET_REGULARS: RecipeInfo = {
  ...WIN_BACK, id: "regulars_gone_quiet", defaults: { inactiveDays: 21, minOrderCount: 3 },
  limits: { inactiveDays: [7, 180], minOrderCount: [2, 20] },
};

describe("drafts", () => {
  it("starts from the recipe's defaults", () => {
    const draft = draftFromRecipe(WIN_BACK);
    expect(draft).toEqual({ recipe: "win_back", name: null, params: { inactiveDays: 30 }, messageTemplate: WIN_BACK.defaultMessage, runMode: "auto", reentryDays: null });
    expect(toApiDraft(draft)).toEqual({ recipe: "win_back", params: { inactiveDays: 30 }, messageTemplate: WIN_BACK.defaultMessage, runMode: "auto", reentryDays: null });
  });

  it("starts from a saved automation and knows when it changed", () => {
    const saved = { id: "a", recipe: "win_back", name: "Miss you", params: { inactiveDays: 45 }, messageTemplate: "Hi", runMode: "manual", reentryDays: 30 } as Automation;
    const draft = draftFromAutomation(saved);
    expect(toApiDraft(draft).name).toBe("Miss you");
    expect(isDraftDirty(draft, { ...draft })).toBe(false);
    expect(isDraftDirty(draft, { ...draft, params: { inactiveDays: 50 } })).toBe(true);
    expect(knobValue(draft, "inactiveDays", WIN_BACK)).toBe(45);
  });
});

describe("stepKnob", () => {
  it("moves days of absence in fives, landing on round numbers", () => {
    expect(stepKnob(30, 1, "inactiveDays", [7, 365])).toBe(35);
    expect(stepKnob(21, 1, "inactiveDays", [7, 180])).toBe(25);
    expect(stepKnob(21, -1, "inactiveDays", [7, 180])).toBe(20);
    expect(stepKnob(10, -1, "inactiveDays", [7, 180])).toBe(7);
  });

  it("moves everything else by one, inside the limits", () => {
    expect(stepKnob(3, 1, "delayHours", [1, 72])).toBe(4);
    expect(stepKnob(1, -1, "delayHours", [1, 72])).toBe(1);
    expect(canStep(1, -1, [1, 72])).toBe(false);
    expect(canStep(72, 1, [1, 72])).toBe(false);
    expect(canStep(5, 1, [1, 72])).toBe(true);
  });
});

describe("minOrderOptions", () => {
  it("offers who gets it in plain words, inside the recipe's limits", () => {
    expect(minOrderOptions(REVIEW, 2).map((o) => o.label)).toEqual([
      "Everyone", "Repeat guests (2+ orders)", "Regulars (3+ orders)", "Regulars (5+ orders)", "Regulars (10+ orders)",
    ]);
    expect(minOrderOptions(QUIET_REGULARS, 3).map((o) => o.value)).toEqual([2, 3, 5, 10]);
    expect(minOrderOptions(QUIET_REGULARS, 4).map((o) => o.value)).toEqual([2, 3, 4, 5, 10]);
    expect(minOrderOptions(WIN_BACK, undefined)).toEqual([]);
  });
});

describe("insertWord", () => {
  it("puts the word at the cursor with a space before it", () => {
    expect(insertWord("Hi", { start: 2, end: 2 }, "firstName")).toEqual({ text: "Hi {{firstName}}", cursor: 16 });
    expect(insertWord("Hi !", { start: 3, end: 3 }, "firstName")).toEqual({ text: "Hi {{firstName}}!", cursor: 16 });
    expect(insertWord("", { start: 0, end: 0 }, "storeName")).toEqual({ text: "{{storeName}}", cursor: 13 });
  });

  it("replaces a selection", () => {
    expect(insertWord("Hi NAME!", { start: 3, end: 7 }, "firstName").text).toBe("Hi {{firstName}}!");
  });
});

describe("messageProblem", () => {
  const vars = WIN_BACK.variables;

  it("passes a message every word of which can be filled", () => {
    expect(messageProblem("Hi {{firstName}}, see {{ menuLink }}", vars)).toBeNull();
  });

  it("blocks unknown words, broken braces, empty and long messages", () => {
    expect(messageProblem("Hi {{rewardName}}", vars)).toBe("“{{rewardName}}” can’t be filled in for this text. Use the word buttons instead.");
    expect(messageProblem("Hi {{firstName", vars)).toBe("A word in {{ }} isn’t finished.");
    expect(messageProblem("   ", vars)).toBe("Write the message first.");
    expect(messageProblem("x".repeat(460), vars)).toMatch(/under 459/);
  });
});

describe("messageLanguage", () => {
  it("knows which default the message still is", () => {
    expect(messageLanguage(WIN_BACK.defaultMessage, WIN_BACK)).toBe("en");
    expect(messageLanguage(` ${WIN_BACK.defaultMessageTl} `, WIN_BACK)).toBe("tl");
    expect(messageLanguage("Hi there", WIN_BACK)).toBeNull();
  });
});

describe("audienceKey", () => {
  const base = { recipe: "win_back" as const, params: { inactiveDays: 30 }, messageTemplate: "Hi {{firstName}}, we miss you!", runMode: "auto" as const };

  it("ignores typing that doesn't change who qualifies", () => {
    expect(audienceKey({ ...base, messageTemplate: "Hello {{firstName}}! Come back soon." })).toBe(audienceKey(base));
  });

  it("changes with the knobs and with the guest details the message needs", () => {
    expect(audienceKey({ ...base, params: { inactiveDays: 45 } })).not.toBe(audienceKey(base));
    expect(audienceKey({ ...base, messageTemplate: "Hi {{firstName}}, your {{favorite}} misses you" })).not.toBe(audienceKey(base));
  });
});

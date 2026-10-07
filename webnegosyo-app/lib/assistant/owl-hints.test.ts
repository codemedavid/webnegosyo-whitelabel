import { HOME_HINT, OWL_HINT_INTRO_OPENS, OWL_SCREEN_HINTS, hintForRoute, screenKeyOf, shouldOfferOwlHint } from "./owl-hints";

describe("screenKeyOf", () => {
  test("names the focused screen, ignoring route groups", () => {
    expect(screenKeyOf(["(main)", "inventory"])).toBe("inventory");
    expect(screenKeyOf(["(main)"])).toBe("dashboard");
    expect(screenKeyOf([])).toBe("dashboard");
  });
});

describe("hintForRoute", () => {
  test("a screen with its own hint offers it", () => {
    expect(hintForRoute(["(main)", "inventory"])).toBe(OWL_SCREEN_HINTS.inventory);
  });

  test("a screen without one falls back to the home hint", () => {
    expect(hintForRoute(["(main)", "account"])).toBe(HOME_HINT);
  });

  test("every hint says what Owl does and carries a question to ask", () => {
    for (const hint of [HOME_HINT, ...Object.values(OWL_SCREEN_HINTS)]) {
      expect(hint.title.trim()).not.toBe("");
      expect(hint.prompt.trim()).not.toBe("");
      expect(hint.prompt.length).toBeLessThanOrEqual(60);
    }
  });
});

describe("shouldOfferOwlHint", () => {
  const base = { isLoaded: true, isDismissed: false, opens: 0, seenScreens: new Set<string>(), screenKey: "dashboard" };

  test("a new owner is offered the screen's hint", () => {
    expect(shouldOfferOwlHint(base)).toBe(true);
  });

  test("never before the saved state has loaded, so a dismissed tip cannot flash", () => {
    expect(shouldOfferOwlHint({ ...base, isLoaded: false })).toBe(false);
  });

  test("never after the owner hid the tips", () => {
    expect(shouldOfferOwlHint({ ...base, isDismissed: true })).toBe(false);
  });

  test("stops once the owner has opened Owl enough times to know it", () => {
    expect(shouldOfferOwlHint({ ...base, opens: OWL_HINT_INTRO_OPENS - 1 })).toBe(true);
    expect(shouldOfferOwlHint({ ...base, opens: OWL_HINT_INTRO_OPENS })).toBe(false);
  });

  test("each screen's hint shows once per app session", () => {
    expect(shouldOfferOwlHint({ ...base, seenScreens: new Set(["dashboard"]) })).toBe(false);
    expect(shouldOfferOwlHint({ ...base, seenScreens: new Set(["dashboard"]), screenKey: "orders" })).toBe(true);
  });
});

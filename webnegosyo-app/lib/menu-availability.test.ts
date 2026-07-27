/**
 * The merchant app's copy of the availability rule.
 *
 * Mirrors `src/lib/inventory/menu-availability.ts`. The app ships as a separate
 * bundle and cannot import from the web app, but the two must never disagree
 * about what a dish's state is or what it is called — a merchant switching
 * between the phone and the browser has to see the same words.
 *
 * The screen assertion is source-level because the app's jest roots are `lib`
 * and `theme` only, the same approach the inventory screen's guardrail uses.
 */

import { readFileSync } from "fs";
import { join } from "path";
import {
  describeMenuAvailability,
  MENU_AVAILABILITY_LABEL,
} from "./menu-availability";

describe("describeMenuAvailability", () => {
  it("reports an item on sale as available", () => {
    expect(
      describeMenuAvailability({ is_available: true, auto_disabled_at: null })
    ).toBe("available");
  });

  it("reports an item the merchant hid as hidden", () => {
    expect(
      describeMenuAvailability({ is_available: false, auto_disabled_at: null })
    ).toBe("hidden");
  });

  it("reports an item auto-86 hid as auto-hidden", () => {
    expect(
      describeMenuAvailability({
        is_available: false,
        auto_disabled_at: "2026-07-27T10:00:00Z",
      })
    ).toBe("auto-hidden");
  });

  it("treats a missing marker column as the merchant hiding it", () => {
    expect(describeMenuAvailability({ is_available: false })).toBe("hidden");
  });

  it("reports an item on sale as available even if a stale marker survives", () => {
    expect(
      describeMenuAvailability({
        is_available: true,
        auto_disabled_at: "2026-07-27T10:00:00Z",
      })
    ).toBe("available");
  });
});

describe("wording matches the web admin", () => {
  const WEB_RULE = join(
    __dirname,
    "..",
    "..",
    "src",
    "lib",
    "inventory",
    "menu-availability.ts"
  );

  it("uses the same three state names as the web rule", () => {
    expect(Object.keys(MENU_AVAILABILITY_LABEL).sort()).toEqual([
      "auto-hidden",
      "available",
      "hidden",
    ]);
  });

  it("uses labels the web rule also declares, so the two cannot drift apart", () => {
    // Reads the web copy rather than restating its strings, so a reworded
    // label there fails here instead of quietly diverging.
    const web = readFileSync(WEB_RULE, "utf8");
    for (const label of Object.values(MENU_AVAILABILITY_LABEL)) {
      expect(web).toContain(`'${label}'`);
    }
  });
});

describe("the product management screen", () => {
  const SCREEN = join(__dirname, "..", "app", "(main)", "product-management.tsx");

  it("labels auto-hidden products through the shared rule, not its own check", () => {
    // A hand-rolled `!is_available && auto_disabled_at` on the screen is how
    // the two surfaces start disagreeing.
    const source = readFileSync(SCREEN, "utf8");
    expect(source).toContain("describeMenuAvailability");
  });
});

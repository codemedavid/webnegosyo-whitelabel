// Guardrail: screen bodies are built from the shared primitives.
//
// Before this, screens drew their own buttons (`primaryButton`,
// `confirmButton`, `collectButton`…), labelled sections with the same 11pt
// uppercase eyebrow the stat cards use for captions, and reached for font
// glyphs (→ ▾ × ⌕ ✓ ⚠) where an icon belonged. Jest only runs pure-logic
// roots, so this reads the screen sources as text.
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SCREENS_DIR = join(__dirname, "..", "app", "(main)");

function listScreens(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listScreens(full);
    return entry.endsWith(".tsx") && !entry.endsWith(".test.tsx") ? [full] : [];
  });
}

const SCREENS = listScreens(SCREENS_DIR).map((full) => [full.replace(`${SCREENS_DIR}/`, ""), full]);

// Characters that are icons in disguise. `·` (a separator dot in captions) and
// `…` are punctuation, not icons, and stay allowed.
const GLYPHS = /[→←›‹✓✕×⌕•▸▾▲▼⚠✔☐☑]/;

// Style keys that mean "a button drawn by hand on this screen".
const AD_HOC_BUTTONS =
  /\b(primaryButton|secondaryButton|dangerButton|confirmButton|cancelButton|collectButton|remedyButton|addButton|deleteButton|removeButton|editButton|smallButton|reprintButton|closeButton)\s*:\s*\{/;

// Section headings are `SectionHeader`. The eyebrow style is for a number's
// caption inside a card, never for the heading over a group.
const CAPTION_EYEBROW =
  /\b(sectionTitle|sectionHeader|sectionLabel|listHeading|blockLabel|groupTitle)\s*:\s*\{\s*\.\.\.typography\.eyebrow/;

/**
 * Screens written before these primitives existed, still to be converted.
 *
 * This is a ratchet, not a licence: a screen NOT listed here is held to the
 * rule, so nothing new arrives hand-drawn. Convert a screen, delete its line —
 * and a listed screen that has quietly become clean fails too, so the list
 * cannot rot into a permanent exemption.
 */
const NOT_YET_CONVERTED: Readonly<Record<string, readonly string[]>> = {
  glyphs: [
    "branch-menu.tsx",
    "campaign/[campaignId].tsx",
    "daily-report.tsx",
    "growth.tsx",
    "inventory.tsx",
    "kitchen.tsx",
    "order/[orderId].tsx",
    "payment/[methodId].tsx",
    "pos.tsx",
    "product/[productId].tsx",
    "scan.tsx",
  ],
  buttons: [
    "branch-menu.tsx",
    "campaign/[campaignId].tsx",
    "order/[orderId].tsx",
    "payment/[methodId].tsx",
    "product/[productId].tsx",
    "product/recipe/[productId].tsx",
    "scan.tsx",
  ],
  eyebrow: ["analytics.tsx", "daily-report.tsx", "pos-tender.tsx"],
};

describe.each(SCREENS)("%s", (name, path) => {
  const source = readFileSync(path, "utf8");

  /**
   * A converted screen must not match; a listed one must still match, so the
   * list shrinks as screens are fixed rather than outliving the debt.
   */
  function expectRule(rule: keyof typeof NOT_YET_CONVERTED, pattern: RegExp) {
    if (NOT_YET_CONVERTED[rule].includes(name as string)) {
      expect(source).toMatch(pattern);
      return;
    }
    expect(source).not.toMatch(pattern);
  }

  it("draws icons, not font glyphs", () => {
    expectRule("glyphs", GLYPHS);
  });

  it("uses the shared Button instead of a hand-drawn one", () => {
    expectRule("buttons", AD_HOC_BUTTONS);
  });

  it("does not label a section with a stat-caption eyebrow", () => {
    expectRule("eyebrow", CAPTION_EYEBROW);
  });
});

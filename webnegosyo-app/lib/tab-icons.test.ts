/**
 * The tab bar draws its icons; it does not print characters.
 *
 * Every icon in the bar used to be a Unicode glyph inside a `<Text>` — ☺ for
 * Customers, the peso sign for Payments, box-drawing characters for the rest.
 * That is not an icon set: the OEM font picks the weight and the optical size,
 * several of those code points arrive as full-colour emoji on newer Android
 * builds (which then ignore `tabBarActiveTintColor` entirely), and one of them
 * — ☺ — is a smiley face standing in for a customer roster.
 *
 * This is a source guardrail because the app's jest run covers pure-logic roots
 * only and cannot render the tab bar.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function readCode(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const LAYOUT = ["app", "(main)", "_layout.tsx"];

describe("tab bar icons", () => {
  it("has a drawn icon component to draw them with", () => {
    const icon = readCode("components", "Icon.tsx");

    expect(icon).toMatch(/react-native-svg/);
  });

  it("never renders a tab icon as a text glyph again", () => {
    // The whole defect in one assertion: `symbol` was the prop that took a
    // character. Nothing in the bar may take one.
    const layout = readCode(...LAYOUT);

    expect(layout).not.toMatch(/TabIcon\s+symbol=/);
    expect(layout).not.toMatch(/fontSize:\s*22/);
  });

  it("names an icon for every tab that has one", () => {
    const layout = readCode(...LAYOUT);
    const icons = layout.match(/tabBarIcon:/g) ?? [];
    const named = layout.match(/<TabIcon name="[a-z-]+"/g) ?? [];

    expect(icons.length).toBeGreaterThan(0);
    expect(named).toHaveLength(icons.length);
  });

  it("gives Customers a roster mark rather than a smiley", () => {
    const layout = readCode(...LAYOUT);

    expect(layout).toMatch(/<TabIcon name="customers"/);
  });

  it("draws every icon on one stroke geometry", () => {
    // Mixed stroke weights across a bar of sixteen marks is the same problem
    // the font glyphs had, reintroduced by hand.
    const icon = readCode("components", "Icon.tsx");
    const widths = icon.match(/strokeWidth = [\d.]+/g) ?? [];

    expect(new Set(widths).size).toBe(1);
    expect(icon).toMatch(/strokeLinecap="square"/);
  });
});

/**
 * Guardrails for the merchant app's Recipe editor screen.
 *
 * Jest here only runs pure-logic roots (lib/, theme/), so — like
 * `daily-report-screen-mount.test.ts` and the other mount guardrails — this
 * asserts on the screen sources rather than rendering them. What it locks
 * down is the wiring a unit test of recipe-service cannot see: that the route
 * is registered, that it is reachable from the product editor, that it is
 * permission-gated the way the rest of the inventory surface is, and that a
 * dish with no recipe tells the merchant the consequence — sales will not
 * deduct stock — instead of showing a silent empty list.
 */
import { readFileSync } from "fs";
import { join } from "path";

import { recipeHref } from "./navigation";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("recipeHref", () => {
  it("builds a fully-substituted string path, the pattern that survives typedRoutes", () => {
    expect(recipeHref("abc-123")).toBe("/(main)/product/recipe/abc-123");
  });

  it("never leaks the unsubstituted [productId] template", () => {
    expect(recipeHref("xyz")).not.toContain("[productId]");
  });
});

describe("recipe editor route", () => {
  const layout = read("app", "(main)", "_layout.tsx");

  it("is registered as a detail screen, never a tab", () => {
    expect(layout).toMatch(/name="product\/recipe\/\[productId\]"/);
    // Detail screens carry href: null so they stay off the tab bar.
    const registration = layout.slice(layout.indexOf('name="product/recipe/[productId]"'));
    expect(registration.slice(0, 300)).toMatch(/href:\s*null/);
  });
});

describe("recipe editor screen", () => {
  const screen = read("app", "(main)", "product", "recipe", "[productId].tsx");

  it("gates on the menu permission like the rest of the inventory surface", () => {
    // The inventory tab rides the "menu" key in staff-permissions; a staff
    // member who cannot edit the menu must not be able to rewire deductions.
    expect(screen).toMatch(/hasPermission\(/);
    expect(screen).toMatch(/"menu"/);
  });

  it("warns that a dish with no recipe will not deduct stock", () => {
    expect(screen).toMatch(/won't deduct stock/i);
  });

  it("defers all data access to recipe-service instead of querying inline", () => {
    expect(screen).toMatch(/from ["']\.\.\/\.\.\/\.\.\/\.\.\/lib\/recipe-service["']/);
    expect(screen).not.toMatch(/supabase\s*\.\s*from\(/);
  });
});

describe("product editor entry point", () => {
  const editor = read("app", "(main)", "product", "[productId].tsx");

  it("links an existing product to its recipe editor", () => {
    expect(editor).toMatch(/recipeHref\(/);
  });
});

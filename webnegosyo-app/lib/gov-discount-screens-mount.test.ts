/**
 * Guardrails for the Tax & discounts screen and the Senior & PWD report.
 *
 * Like the other mount guardrails, this reads the screen sources instead of
 * rendering them. It pins the wiring no unit test of the pure modules sees:
 * that both screens are registered and reachable, that the register's
 * "Set up Tax & discounts" route lands on a real file, that a save invalidates
 * the cache the register prices from, and that the product/category editors
 * show the eligibility switch.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { TAX_SETTINGS_ROUTE } from "./gov-ledger/routes";
import { GOV_REPORT_ROUTE } from "./gov-reports/routes";

const ROOT = join(__dirname, "..");
const read = (...segments: string[]): string => readFileSync(join(ROOT, ...segments), "utf8");
const routeFile = (route: string): string => join(ROOT, "app", `${route.replace(/^\//, "")}.tsx`);

describe("Tax & discounts screen", () => {
  it("lives at the route the register pushes", () => {
    expect(TAX_SETTINGS_ROUTE).toBe("/(main)/tax-settings");
    expect(existsSync(routeFile(TAX_SETTINGS_ROUTE))).toBe(true);
  });

  it("is registered as a pushed screen, not a tab", () => {
    expect(read("app", "(main)", "_layout.tsx")).toMatch(/name="tax-settings" options=\{\{ href: null/);
  });

  it("is listed under Manage for whoever may open it", () => {
    const hub = read("app", "(main)", "menu.tsx");
    expect(hub).toContain("canOpenTaxSettings");
    expect(hub).toContain("TAX_SETTINGS_ROUTE");
  });

  it("saves through the owner-only service and refreshes the register's profile", () => {
    const screen = read("app", "(main)", "tax-settings.tsx");
    expect(screen).toContain("saveTaxProfile(");
    expect(screen).toContain("invalidateProfile(");
    expect(read("lib", "query", "use-tax-settings-cache.ts")).toContain("invalidateTaxProfile(");
    expect(screen).toContain("canEditTaxSettings");
    // An unreadable profile must never fall through to a blank form.
    expect(screen).toContain("ErrorState");
  });

  it("offers the approval PIN only to those who may hold one", () => {
    const screen = read("app", "(main)", "tax-settings.tsx");
    expect(screen).toContain("canHoldApprovalPin");
    expect(read("components", "tax-settings", "ApprovalPinCard.tsx")).toContain("saveOwnApprovalPin(");
  });
});

describe("Senior & PWD report", () => {
  it("has a registered route file", () => {
    expect(existsSync(routeFile(GOV_REPORT_ROUTE))).toBe(true);
    expect(read("app", "(main)", "_layout.tsx")).toMatch(/name="gov-discounts" options=\{\{ href: null/);
  });

  it("is reached from Reports and from Tax & discounts, for reviewers only", () => {
    for (const file of ["reports.tsx", "tax-settings.tsx"]) {
      const source = read("app", "(main)", file);
      expect(source).toContain("canReviewGovDiscounts");
      expect(source).toContain("GOV_REPORT_ROUTE");
    }
  });

  it("refreshes the report after a review", () => {
    const screen = read("app", "(main)", "gov-discounts.tsx");
    expect(screen).toContain("submitGovReview(");
    expect(screen).toContain("invalidateReport(");
    expect(read("lib", "query", "use-tax-settings-cache.ts")).toContain("invalidateGovReport(");
  });
});

describe("menu eligibility switches", () => {
  it("is on the product and the category editor", () => {
    for (const file of [["product", "[productId].tsx"], ["category", "[categoryId].tsx"]]) {
      const source = read("app", "(main)", ...file);
      expect(source).toContain("<GovEligibleSwitch");
      expect(source).toContain('updateField("gov_discount_eligible"');
    }
  });
});

/**
 * Guardrail: every merchant-app surface that shows the guest list refuses on
 * its own when the account lacks the `customers` grant.
 *
 * The tab bar hid the Customers tab from an ungranted staffer, but the screen
 * itself, the campaign editor (an unmapped route, allowed by default) and the
 * POS picker all read `customers` directly. RLS is now the real boundary
 * (supabase/migrations/20261004180000_customers_staff_permission.sql); these
 * guards make the screens say "No access" instead of rendering an error, and
 * keep the register on the exact-lookup path that RLS still allows.
 *
 * Jest here runs only the pure-logic roots, so — like the other mount
 * guardrails in this package — this asserts on the sources.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("the customers access gate", () => {
  it("decides on the customers grant", () => {
    const gate = read("components", "customers", "CustomersAccessGate.tsx");
    expect(gate).toMatch(/hasPermission\([^)]*"customers"\)/);
  });

  it.each([
    ["app", "(main)", "customers.tsx"],
    ["app", "(main)", "campaign", "[campaignId].tsx"],
  ])("wraps %s/%s/%s", (...segments: string[]) => {
    const screen = read(...segments);
    expect(screen).toMatch(/<CustomersAccessGate\b/);
  });
});

describe("the POS customer picker", () => {
  const picker = read("components", "pos", "CustomerPickerSheet.tsx");

  it("reads guests only through the register lookup", () => {
    expect(picker).toMatch(/findAttachableCustomers\(/);
    expect(picker).toMatch(/createAttachableCustomer\(/);
    expect(picker).not.toMatch(/\blistCustomers\b/);
    expect(picker).not.toMatch(/\bcreateCustomer\b/);
  });

  it("browses the list only for staff holding the customers grant", () => {
    expect(picker).toMatch(/hasPermission\([^)]*"customers"\)/);
  });
});

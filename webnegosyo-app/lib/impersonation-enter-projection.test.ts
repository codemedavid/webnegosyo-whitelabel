/**
 * "Open as merchant" must hand enterTenant the WHOLE tenant row.
 *
 * Both superadmin screens select the tenant with a projection that carries
 * `logo_url`, but each then rebuilt a six-field object literal for
 * `enterTenant` and left the logo (and the schema version and feature flags)
 * behind. The impersonated session came up with `receiptLogoUrl: null`, so a
 * reprint from the superadmin's view silently dropped the merchant's logo
 * block — no error anywhere, just a receipt that didn't match the Studio.
 *
 * Same class of defect as the session-select drift: pin the projection AND
 * forbid the hand-built literal, so every column the row carries reaches the
 * impersonation patch.
 */
import fs from "fs";
import path from "path";

const CALL_SITES = ["app/(superadmin)/tenants.tsx", "app/(superadmin)/tenant/[id].tsx"];

const REQUIRED_COLUMNS = [
  "id",
  "slug",
  "name",
  "convex_deployment_url",
  "convex_schema_version",
  "order_backend",
  "receipt_layout",
  "logo_url",
  "customer_hub_enabled",
  "loyalty_enabled",
];

function read(relative: string): string {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

function projectionOf(source: string): string[] {
  const match = source.match(/const (?:TENANT|EDITOR)_COLUMNS =\s*"([^"]+)"/);
  if (!match) throw new Error("tenant projection constant not found");
  return match[1].split(",").map((column) => column.trim());
}

describe("superadmin impersonation projection", () => {
  it.each(CALL_SITES)("%s selects every column enterTenant reads", (relative) => {
    const columns = projectionOf(read(relative));
    for (const required of REQUIRED_COLUMNS) {
      expect(columns).toContain(required);
    }
  });

  it.each(CALL_SITES)("%s passes the fetched row straight to enterTenant", (relative) => {
    const source = read(relative);
    // The hand-built literal is exactly how the logo went missing.
    expect(source).not.toMatch(/enterTenant\([^)]*\{\s*id: tenant\.id/);
    expect(source).toMatch(/enterTenant\([^,]+,\s*tenant\)/);
  });
});

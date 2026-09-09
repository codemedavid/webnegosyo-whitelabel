/**
 * The two sign-in paths must read the SAME tenant columns.
 *
 * The app looks up a tenant in two places — `app/_layout.tsx` when it restores a
 * session, and `app/(auth)/login.tsx` when someone signs in — and each used to
 * spell the projection out as its own string literal. A column added to one and
 * not the other resolves to `undefined` on the other path, with no error
 * anywhere: the feature works for a user who just logged in and is silently
 * missing for the same user tomorrow when the app restores their session.
 *
 * This is the same class of defect as the storefront-select drift on the web
 * side, and the fix is the same: one exported constant, pinned here.
 */
import fs from "fs";
import path from "path";

import { TENANT_SESSION_SELECT } from "./session-resolve";

const CALL_SITES = ["app/_layout.tsx", "app/(auth)/login.tsx"];

function read(relative: string): string {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

describe("tenant session projection", () => {
  it.each(CALL_SITES)("%s selects through the shared constant", (relative) => {
    const source = read(relative);

    expect(source).toContain(".select(TENANT_SESSION_SELECT)");
    // A hand-written tenant projection is exactly how the two drifted apart.
    expect(source).not.toMatch(/\.select\("id, slug, name, convex_deployment_url/);
  });

  it("carries every column the session patch reads", () => {
    const columns = TENANT_SESSION_SELECT.split(",").map((column) => column.trim());

    for (const required of [
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
    ]) {
      expect(columns).toContain(required);
    }
  });
});

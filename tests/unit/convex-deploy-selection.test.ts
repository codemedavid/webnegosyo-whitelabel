/**
 * Which tenants a bulk Convex deploy has to re-push.
 *
 * `tenants.convex_schema_version` is a TEXT column, and the bulk deploy asked
 * PostgREST for `convex_schema_version.lt.18`. Text compares lexically: "5" is
 * not less than "18", and neither is "9". So from the moment head passed
 * version 10, every tenant sitting on a single-digit version became invisible
 * to the bulk deploy and was never re-pushed again.
 *
 * That is not hypothetical. It is why a store still running v5 rejected a
 * counter sale with `ArgumentValidationError … Value: "pos"` — v5 predates the
 * bundle that taught `orders.source` the value — while the button meant to fix
 * it reported success and skipped that store.
 *
 * The comparison therefore has to be numeric, which is what this covers.
 */
import { tenantsNeedingDeploy } from "@/lib/convex-deploy-selection";

const CURRENT = 18;

describe("tenantsNeedingDeploy", () => {
  it("selects a single-digit version that lexical comparison hid", () => {
    const rows = [
      { id: "on-5", convex_schema_version: "5" },
      { id: "on-9", convex_schema_version: "9" },
    ];

    expect(tenantsNeedingDeploy(rows, CURRENT).map((t) => t.id)).toEqual([
      "on-5",
      "on-9",
    ]);
  });

  it("selects a tenant that has never been deployed", () => {
    const rows = [
      { id: "never", convex_schema_version: null },
      { id: "blank", convex_schema_version: "" },
    ];

    expect(tenantsNeedingDeploy(rows, CURRENT).map((t) => t.id)).toEqual([
      "never",
      "blank",
    ]);
  });

  it("skips a tenant already on the current version", () => {
    expect(
      tenantsNeedingDeploy([{ id: "current", convex_schema_version: "18" }], CURRENT),
    ).toEqual([]);
  });

  it("skips a tenant ahead of this build, rather than pushing it backwards", () => {
    expect(
      tenantsNeedingDeploy([{ id: "ahead", convex_schema_version: "19" }], CURRENT),
    ).toEqual([]);
  });

  it("treats an unreadable version as never deployed", () => {
    expect(
      tenantsNeedingDeploy([{ id: "junk", convex_schema_version: "v5" }], CURRENT).map(
        (t) => t.id,
      ),
    ).toEqual(["junk"]);
  });

  it("accepts a numeric version, since the column's type is not guaranteed", () => {
    const rows = [
      { id: "num-old", convex_schema_version: 5 },
      { id: "num-current", convex_schema_version: 18 },
    ];

    expect(tenantsNeedingDeploy(rows, CURRENT).map((t) => t.id)).toEqual(["num-old"]);
  });

  it("preserves input order, so a deploy run reads predictably", () => {
    const rows = [
      { id: "a", convex_schema_version: "5" },
      { id: "b", convex_schema_version: "18" },
      { id: "c", convex_schema_version: null },
    ];

    expect(tenantsNeedingDeploy(rows, CURRENT).map((t) => t.id)).toEqual(["a", "c"]);
  });
});

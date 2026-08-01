import {
  FEATURE_FILTERS,
  filterTenants,
  summarizeTenants,
  tenantFeatureLabels,
} from "./tenant-list";

const COFFEE = {
  id: "t1",
  slug: "coffee",
  name: "Webnegosyo Coffee",
  is_active: true,
  convex_deployment_url: "https://coffee.convex.cloud",
  menu_engineering_enabled: true,
  bundles_enabled: false,
  app_enabled: true,
  lalamove_enabled: false,
};

const BAKERY = {
  id: "t2",
  slug: "sunrise-bakery",
  name: "Sunrise Bakery",
  is_active: true,
  convex_deployment_url: null,
  menu_engineering_enabled: false,
  bundles_enabled: true,
  app_enabled: false,
  lalamove_enabled: false,
};

const GRILL = {
  id: "t3",
  slug: "corner-grill",
  name: "Corner Grill",
  is_active: false,
  convex_deployment_url: null,
  menu_engineering_enabled: false,
  bundles_enabled: false,
  app_enabled: false,
  lalamove_enabled: true,
};

const ALL = [COFFEE, BAKERY, GRILL];

describe("filterTenants — search", () => {
  it("returns every tenant for an empty query", () => {
    expect(filterTenants(ALL, { query: "" })).toHaveLength(3);
  });

  it("matches on name", () => {
    expect(filterTenants(ALL, { query: "Bakery" }).map((t) => t.id)).toEqual([
      "t2",
    ]);
  });

  it("matches on slug", () => {
    expect(filterTenants(ALL, { query: "corner-grill" }).map((t) => t.id)).toEqual(
      ["t3"]
    );
  });

  it("ignores case", () => {
    expect(filterTenants(ALL, { query: "COFFEE" }).map((t) => t.id)).toEqual([
      "t1",
    ]);
  });

  it("ignores surrounding whitespace", () => {
    expect(filterTenants(ALL, { query: "  bakery  " }).map((t) => t.id)).toEqual(
      ["t2"]
    );
  });

  it("returns nothing when no tenant matches", () => {
    expect(filterTenants(ALL, { query: "zzz" })).toEqual([]);
  });
});

describe("filterTenants — status", () => {
  it("defaults to every status", () => {
    expect(filterTenants(ALL, { query: "" })).toHaveLength(3);
  });

  it("keeps only active tenants", () => {
    expect(filterTenants(ALL, { query: "", status: "active" }).map((t) => t.id)).toEqual(
      ["t1", "t2"]
    );
  });

  it("keeps only inactive tenants", () => {
    expect(
      filterTenants(ALL, { query: "", status: "inactive" }).map((t) => t.id)
    ).toEqual(["t3"]);
  });
});

describe("filterTenants — feature", () => {
  it("keeps only tenants with the chosen feature enabled", () => {
    expect(
      filterTenants(ALL, { query: "", feature: "bundles_enabled" }).map((t) => t.id)
    ).toEqual(["t2"]);
  });

  it("keeps only tenants with a mobile app", () => {
    expect(
      filterTenants(ALL, { query: "", feature: "app_enabled" }).map((t) => t.id)
    ).toEqual(["t1"]);
  });

  it("combines search, status and feature", () => {
    expect(
      filterTenants(ALL, {
        query: "e",
        status: "active",
        feature: "menu_engineering_enabled",
      }).map((t) => t.id)
    ).toEqual(["t1"]);
  });
});

describe("filterTenants — purity", () => {
  it("does not mutate or reorder the source list", () => {
    const source = [...ALL];

    filterTenants(source, { query: "coffee" });

    expect(source).toEqual(ALL);
  });

  it("returns a new array", () => {
    expect(filterTenants(ALL, { query: "" })).not.toBe(ALL);
  });
});

describe("FEATURE_FILTERS", () => {
  it("offers a filter for each per-tenant feature flag", () => {
    expect(FEATURE_FILTERS.map((f) => f.key)).toEqual([
      "menu_engineering_enabled",
      "bundles_enabled",
      "app_enabled",
      "lalamove_enabled",
    ]);
  });

  it("labels every filter", () => {
    for (const filter of FEATURE_FILTERS) {
      expect(filter.label.length).toBeGreaterThan(0);
    }
  });
});

describe("tenantFeatureLabels", () => {
  it("lists the enabled features for a tenant", () => {
    expect(tenantFeatureLabels(COFFEE)).toEqual(["Menu Engineering", "Mobile App"]);
  });

  it("returns an empty list when nothing is enabled", () => {
    expect(
      tenantFeatureLabels({ ...COFFEE, menu_engineering_enabled: false, app_enabled: false })
    ).toEqual([]);
  });
});

describe("summarizeTenants", () => {
  it("counts the platform totals for the overview cards", () => {
    expect(summarizeTenants(ALL)).toEqual({
      total: 3,
      active: 2,
      inactive: 1,
      withApp: 1,
      withConvex: 1,
    });
  });

  it("handles an empty platform", () => {
    expect(summarizeTenants([])).toEqual({
      total: 0,
      active: 0,
      inactive: 0,
      withApp: 0,
      withConvex: 0,
    });
  });
});

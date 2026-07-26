import {
  FEATURE_TOGGLES,
  TENANT_EDITOR_TABS,
  applyFeatureToggle,
  toFormValues,
  toUpdatePayload,
  validateTenantForm,
} from "./tenant-form";

const TENANT_ROW = {
  id: "t1",
  name: "Webnegosyo Coffee",
  slug: "coffee",
  is_active: true,
  messenger_page_id: "page-123",
  messenger_username: "coffeeph",
  messenger_redirect_mode: "webhook",
  mapbox_enabled: true,
  enable_order_management: true,
  menu_engineering_enabled: true,
  checkout_upsell_enabled: true,
  hide_currency_symbol: false,
  flash_screen_feature_enabled: false,
  bundles_enabled: false,
  pairing_rules_enabled: false,
  qr_handoff_enabled: false,
  app_enabled: true,
  restaurant_address: "123 Main St",
  restaurant_latitude: 14.5995,
  restaurant_longitude: 120.9842,
  lalamove_enabled: false,
  lalamove_api_key: null,
  lalamove_secret_key: null,
  lalamove_market: "PH",
  lalamove_service_type: "MOTORCYCLE",
  lalamove_sandbox: true,
  lalamove_sender_phone: null,
  distance_delivery_enabled: false,
  delivery_price_per_km: null,
  delivery_min_fee: null,
  delivery_radius_km: null,
  convex_deployment_url: "https://coffee.convex.cloud",
  convex_deploy_key: "key-abc",
  admin_email: "owner@example.com",
  email_notifications_enabled: true,
};

function baseValues() {
  return toFormValues(TENANT_ROW);
}

describe("TENANT_EDITOR_TABS", () => {
  it("mirrors the web editor minus branding", () => {
    // Branding stays web-only (Branding Studio); the app never edits colors.
    expect(TENANT_EDITOR_TABS.map((t) => t.key)).toEqual([
      "general",
      "features",
      "integrations",
      "delivery",
      "team",
      "import",
    ]);
  });

  it("has no branding tab", () => {
    expect(TENANT_EDITOR_TABS.map((t) => t.key)).not.toContain("branding");
  });

  it("labels every tab", () => {
    for (const tab of TENANT_EDITOR_TABS) {
      expect(tab.label.length).toBeGreaterThan(0);
    }
  });
});

describe("toFormValues", () => {
  it("maps text columns straight across", () => {
    expect(baseValues()).toMatchObject({
      name: "Webnegosyo Coffee",
      slug: "coffee",
      messenger_page_id: "page-123",
      restaurant_address: "123 Main St",
    });
  });

  it("renders numeric columns as editable strings", () => {
    expect(baseValues().restaurant_latitude).toBe("14.5995");
    expect(baseValues().restaurant_longitude).toBe("120.9842");
  });

  it("renders a null number as an empty string, not the text 'null'", () => {
    expect(baseValues().delivery_price_per_km).toBe("");
  });

  it("renders a null string column as an empty string", () => {
    expect(baseValues().lalamove_api_key).toBe("");
  });

  it("carries booleans across unchanged", () => {
    expect(baseValues().menu_engineering_enabled).toBe(true);
    expect(baseValues().bundles_enabled).toBe(false);
  });

  it("does not surface any branding field", () => {
    expect(Object.keys(baseValues()).join(",")).not.toMatch(/color/);
  });
});

describe("toFormValues — a freshly created tenant", () => {
  // A new tenant row has NULL in almost every optional column; the editor must
  // open on it without rendering "null" or crashing on a missing default.
  const BARE_TENANT = {
    ...TENANT_ROW,
    messenger_page_id: null,
    messenger_username: null,
    messenger_redirect_mode: null,
    restaurant_address: null,
    restaurant_latitude: null,
    restaurant_longitude: null,
    lalamove_market: null,
    lalamove_service_type: null,
    lalamove_sender_phone: null,
    delivery_min_fee: null,
    delivery_radius_km: null,
    convex_deployment_url: null,
    convex_deploy_key: null,
    admin_email: null,
  };

  it("renders every null column as an empty string", () => {
    const values = toFormValues(BARE_TENANT);

    expect(values.messenger_page_id).toBe("");
    expect(values.restaurant_address).toBe("");
    expect(values.restaurant_latitude).toBe("");
    expect(values.lalamove_sender_phone).toBe("");
    expect(values.convex_deployment_url).toBe("");
    expect(values.admin_email).toBe("");
  });

  it("falls back to sensible defaults for the choice columns", () => {
    const values = toFormValues(BARE_TENANT);

    expect(values.messenger_redirect_mode).toBe("webhook");
    expect(values.lalamove_market).toBe("PH");
    expect(values.lalamove_service_type).toBe("MOTORCYCLE");
  });

  it("survives a round trip back to null", () => {
    const payload = toUpdatePayload(toFormValues(BARE_TENANT));

    expect(payload.messenger_page_id).toBeNull();
    expect(payload.restaurant_latitude).toBeNull();
    expect(payload.convex_deploy_key).toBeNull();
  });
});

describe("toUpdatePayload", () => {
  it("round-trips an untouched tenant back to its own values", () => {
    const payload = toUpdatePayload(baseValues());

    expect(payload).toMatchObject({
      name: "Webnegosyo Coffee",
      slug: "coffee",
      restaurant_latitude: 14.5995,
      menu_engineering_enabled: true,
    });
  });

  it("parses numeric strings back into numbers", () => {
    const payload = toUpdatePayload({
      ...baseValues(),
      distance_delivery_enabled: true,
      delivery_price_per_km: "12.5",
      delivery_min_fee: "50",
      delivery_radius_km: "8",
    });

    expect(payload.delivery_price_per_km).toBe(12.5);
    expect(payload.delivery_min_fee).toBe(50);
    expect(payload.delivery_radius_km).toBe(8);
  });

  it("writes an empty numeric field back as null, not NaN", () => {
    const payload = toUpdatePayload({
      ...baseValues(),
      restaurant_latitude: "",
      restaurant_longitude: "",
    });

    expect(payload.restaurant_latitude).toBeNull();
    expect(payload.restaurant_longitude).toBeNull();
  });

  it("writes an empty text field back as null", () => {
    const payload = toUpdatePayload({ ...baseValues(), restaurant_address: "" });

    expect(payload.restaurant_address).toBeNull();
  });

  it("trims whitespace from text fields", () => {
    const payload = toUpdatePayload({ ...baseValues(), name: "  Corner Grill  " });

    expect(payload.name).toBe("Corner Grill");
  });

  it("never writes a branding column", () => {
    // Guardrail for the agreed scope: the app must not clobber colors set in
    // the web Branding Studio.
    expect(Object.keys(toUpdatePayload(baseValues())).join(",")).not.toMatch(
      /color|template|font/
    );
  });

  it("never writes the primary key", () => {
    expect(toUpdatePayload(baseValues())).not.toHaveProperty("id");
  });

  it("does not mutate the values it is given", () => {
    const values = baseValues();
    const snapshot = { ...values };

    toUpdatePayload(values);

    expect(values).toEqual(snapshot);
  });
});

describe("validateTenantForm — identity", () => {
  it("accepts a well-formed tenant", () => {
    expect(validateTenantForm(baseValues())).toEqual({});
  });

  it("requires a name", () => {
    expect(validateTenantForm({ ...baseValues(), name: "   " }).name).toMatch(
      /required/i
    );
  });

  it("requires a slug", () => {
    expect(validateTenantForm({ ...baseValues(), slug: "" }).slug).toMatch(
      /required/i
    );
  });

  it("rejects a slug with uppercase or spaces", () => {
    expect(validateTenantForm({ ...baseValues(), slug: "My Cafe" }).slug).toBeDefined();
  });

  it("rejects a slug with a leading or trailing dash", () => {
    expect(validateTenantForm({ ...baseValues(), slug: "-cafe" }).slug).toBeDefined();
    expect(validateTenantForm({ ...baseValues(), slug: "cafe-" }).slug).toBeDefined();
  });

  it("accepts a slug with inner dashes and digits", () => {
    expect(validateTenantForm({ ...baseValues(), slug: "cafe-24-manila" }).slug).toBeUndefined();
  });

  it.each(["www", "superadmin", "app", "admin"])(
    "rejects the reserved subdomain %s",
    (slug) => {
      // These resolve to platform routes in src/middleware.ts, so a tenant
      // claiming one would be unreachable.
      expect(validateTenantForm({ ...baseValues(), slug }).slug).toMatch(
        /reserved/i
      );
    }
  );
});

describe("validateTenantForm — delivery", () => {
  it("requires Lalamove credentials once Lalamove is enabled", () => {
    const errors = validateTenantForm({
      ...baseValues(),
      lalamove_enabled: true,
      lalamove_api_key: "",
      lalamove_secret_key: "",
    });

    expect(errors.lalamove_api_key).toMatch(/required/i);
    expect(errors.lalamove_secret_key).toMatch(/required/i);
  });

  it("ignores blank Lalamove credentials while Lalamove is off", () => {
    expect(validateTenantForm(baseValues()).lalamove_api_key).toBeUndefined();
  });

  it("requires the fee inputs once distance delivery is enabled", () => {
    const errors = validateTenantForm({
      ...baseValues(),
      distance_delivery_enabled: true,
      delivery_price_per_km: "",
      delivery_radius_km: "",
    });

    expect(errors.delivery_price_per_km).toMatch(/required/i);
    expect(errors.delivery_radius_km).toMatch(/required/i);
  });

  it("rejects a negative price per km", () => {
    const errors = validateTenantForm({
      ...baseValues(),
      distance_delivery_enabled: true,
      delivery_price_per_km: "-5",
      delivery_min_fee: "0",
      delivery_radius_km: "5",
    });

    expect(errors.delivery_price_per_km).toBeDefined();
  });

  it("rejects a non-numeric fee", () => {
    const errors = validateTenantForm({
      ...baseValues(),
      distance_delivery_enabled: true,
      delivery_price_per_km: "abc",
      delivery_min_fee: "0",
      delivery_radius_km: "5",
    });

    expect(errors.delivery_price_per_km).toBeDefined();
  });

  it("rejects a zero delivery radius, which would block every order", () => {
    const errors = validateTenantForm({
      ...baseValues(),
      distance_delivery_enabled: true,
      delivery_price_per_km: "10",
      delivery_min_fee: "0",
      delivery_radius_km: "0",
    });

    expect(errors.delivery_radius_km).toBeDefined();
  });

  it("accepts a fully configured distance delivery setup", () => {
    const errors = validateTenantForm({
      ...baseValues(),
      distance_delivery_enabled: true,
      delivery_price_per_km: "10",
      delivery_min_fee: "49",
      delivery_radius_km: "8",
    });

    expect(errors).toEqual({});
  });
});

describe("validateTenantForm — coordinates", () => {
  it("rejects an out-of-range latitude", () => {
    expect(
      validateTenantForm({ ...baseValues(), restaurant_latitude: "99" })
        .restaurant_latitude
    ).toBeDefined();
  });

  it("rejects an out-of-range longitude", () => {
    expect(
      validateTenantForm({ ...baseValues(), restaurant_longitude: "-200" })
        .restaurant_longitude
    ).toBeDefined();
  });

  it("accepts blank coordinates", () => {
    const errors = validateTenantForm({
      ...baseValues(),
      restaurant_latitude: "",
      restaurant_longitude: "",
    });

    expect(errors.restaurant_latitude).toBeUndefined();
    expect(errors.restaurant_longitude).toBeUndefined();
  });
});

describe("FEATURE_TOGGLES", () => {
  it("covers every per-tenant feature flag the web exposes", () => {
    expect(FEATURE_TOGGLES.map((f) => f.key)).toEqual([
      "is_active",
      "menu_engineering_enabled",
      "checkout_upsell_enabled",
      "bundles_enabled",
      "pairing_rules_enabled",
      "qr_handoff_enabled",
      "flash_screen_feature_enabled",
      "mapbox_enabled",
      "enable_order_management",
      "hide_currency_symbol",
      "app_enabled",
    ]);
  });

  it("declares the checkout upsell dependency on menu engineering", () => {
    const upsell = FEATURE_TOGGLES.find(
      (f) => f.key === "checkout_upsell_enabled"
    );

    expect(upsell?.requires).toBe("menu_engineering_enabled");
  });

  it("labels every toggle", () => {
    for (const toggle of FEATURE_TOGGLES) {
      expect(toggle.label.length).toBeGreaterThan(0);
    }
  });
});

describe("applyFeatureToggle", () => {
  it("turns a plain flag on", () => {
    const next = applyFeatureToggle(baseValues(), "bundles_enabled", true);

    expect(next.bundles_enabled).toBe(true);
  });

  it("turns off the checkout upsell when menu engineering is turned off", () => {
    // checkout_upsell_enabled requires menu_engineering_enabled; leaving it set
    // would persist a state the storefront can never honour.
    const next = applyFeatureToggle(
      baseValues(),
      "menu_engineering_enabled",
      false
    );

    expect(next.menu_engineering_enabled).toBe(false);
    expect(next.checkout_upsell_enabled).toBe(false);
  });

  it("refuses to enable the checkout upsell while menu engineering is off", () => {
    const off = applyFeatureToggle(baseValues(), "menu_engineering_enabled", false);

    const next = applyFeatureToggle(off, "checkout_upsell_enabled", true);

    expect(next.checkout_upsell_enabled).toBe(false);
  });

  it("allows the checkout upsell while menu engineering is on", () => {
    const next = applyFeatureToggle(baseValues(), "checkout_upsell_enabled", true);

    expect(next.checkout_upsell_enabled).toBe(true);
  });

  it("does not mutate the values it is given", () => {
    const values = baseValues();
    const snapshot = { ...values };

    applyFeatureToggle(values, "bundles_enabled", true);

    expect(values).toEqual(snapshot);
  });
});

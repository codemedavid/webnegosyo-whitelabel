// Tenant editor form logic — the mobile counterpart of the web's
// tenant-form-wrapper, minus branding. Colors, card templates and fonts stay
// web-only (the Branding Studio owns them), so nothing here reads or writes a
// branding column and the app can never clobber a palette set there.
//
// Pure functions: row -> form values -> validated update payload. The screen
// holds the values in state and stays presentational.

/** Editor tabs, mirroring the web editor minus branding. */
export interface TenantEditorTab {
  key: string;
  label: string;
}

export const TENANT_EDITOR_TABS: readonly TenantEditorTab[] = [
  { key: "general", label: "General" },
  { key: "features", label: "Features" },
  { key: "integrations", label: "Integrations" },
  { key: "delivery", label: "Delivery" },
  { key: "team", label: "Team" },
  { key: "import", label: "Import" },
] as const;

/** Slugs that resolve to platform routes rather than a tenant. */
const RESERVED_SLUGS = ["www", "superadmin", "app", "admin"];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The tenant columns the editor reads. */
export interface TenantEditorRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  /** Managed outside the text form — uploaded and saved on its own. */
  logo_url?: string | null;
  messenger_page_id: string | null;
  messenger_username: string | null;
  messenger_redirect_mode: string | null;
  mapbox_enabled: boolean;
  enable_order_management: boolean;
  menu_engineering_enabled: boolean;
  checkout_upsell_enabled: boolean;
  hide_currency_symbol: boolean;
  flash_screen_feature_enabled: boolean;
  bundles_enabled: boolean;
  pairing_rules_enabled: boolean;
  qr_handoff_enabled: boolean;
  app_enabled: boolean;
  restaurant_address: string | null;
  restaurant_latitude: number | null;
  restaurant_longitude: number | null;
  lalamove_enabled: boolean;
  lalamove_api_key: string | null;
  lalamove_secret_key: string | null;
  lalamove_market: string | null;
  lalamove_service_type: string | null;
  lalamove_sandbox: boolean;
  lalamove_sender_phone: string | null;
  distance_delivery_enabled: boolean;
  delivery_price_per_km: number | null;
  delivery_min_fee: number | null;
  delivery_radius_km: number | null;
  convex_deployment_url: string | null;
  convex_deploy_key: string | null;
  admin_email: string | null;
  email_notifications_enabled: boolean;
}

/** Editable form state — numbers held as strings while being typed. */
export interface TenantFormValues {
  name: string;
  slug: string;
  is_active: boolean;
  messenger_page_id: string;
  messenger_username: string;
  messenger_redirect_mode: string;
  mapbox_enabled: boolean;
  enable_order_management: boolean;
  menu_engineering_enabled: boolean;
  checkout_upsell_enabled: boolean;
  hide_currency_symbol: boolean;
  flash_screen_feature_enabled: boolean;
  bundles_enabled: boolean;
  pairing_rules_enabled: boolean;
  qr_handoff_enabled: boolean;
  app_enabled: boolean;
  restaurant_address: string;
  restaurant_latitude: string;
  restaurant_longitude: string;
  lalamove_enabled: boolean;
  lalamove_api_key: string;
  lalamove_secret_key: string;
  lalamove_market: string;
  lalamove_service_type: string;
  lalamove_sandbox: boolean;
  lalamove_sender_phone: string;
  distance_delivery_enabled: boolean;
  delivery_price_per_km: string;
  delivery_min_fee: string;
  delivery_radius_km: string;
  convex_deployment_url: string;
  convex_deploy_key: string;
  admin_email: string;
  email_notifications_enabled: boolean;
}

export type TenantFormErrors = Partial<Record<keyof TenantFormValues, string>>;

/** Boolean feature flags the Features tab exposes. */
export type TenantFeatureToggleKey = Extract<
  keyof TenantFormValues,
  | "is_active"
  | "menu_engineering_enabled"
  | "checkout_upsell_enabled"
  | "bundles_enabled"
  | "pairing_rules_enabled"
  | "qr_handoff_enabled"
  | "flash_screen_feature_enabled"
  | "mapbox_enabled"
  | "enable_order_management"
  | "hide_currency_symbol"
  | "app_enabled"
>;

export interface TenantFeatureToggle {
  key: TenantFeatureToggleKey;
  label: string;
  description: string;
  /** Flag that must be on for this one to apply. */
  requires?: TenantFeatureToggleKey;
}

export const FEATURE_TOGGLES: readonly TenantFeatureToggle[] = [
  {
    key: "is_active",
    label: "Store active",
    description: "Turning this off takes the storefront offline",
  },
  {
    key: "menu_engineering_enabled",
    label: "Menu Engineering",
    description: "BCG classification, badges and upsell pairs",
  },
  {
    key: "checkout_upsell_enabled",
    label: "Checkout Upsell",
    description: "\"Before you go…\" interstitial before checkout",
    requires: "menu_engineering_enabled",
  },
  {
    key: "bundles_enabled",
    label: "Bundles",
    description: "Menu bundles and bundle upsells",
  },
  {
    key: "pairing_rules_enabled",
    label: "Pairing Rules",
    description: "Rule-driven item pairings",
  },
  {
    key: "qr_handoff_enabled",
    label: "QR Handoff",
    description: "Hand an order off to the counter by QR",
  },
  {
    key: "flash_screen_feature_enabled",
    label: "Flash Screen",
    description: "Promotional splash on the storefront",
  },
  {
    key: "mapbox_enabled",
    label: "Address Autocomplete",
    description: "Mapbox address search at checkout",
  },
  {
    key: "enable_order_management",
    label: "Order Management",
    description: "Save orders to the database for the admin queue",
  },
  {
    key: "hide_currency_symbol",
    label: "Hide Currency Symbol",
    description: "Show bare amounts on the storefront",
  },
  {
    key: "app_enabled",
    label: "Mobile App",
    description: "White-labeled customer app availability",
  },
] as const;

function numberToInput(value: number | null): string {
  return value === null || value === undefined ? "" : String(value);
}

export function toFormValues(tenant: TenantEditorRow): TenantFormValues {
  return {
    name: tenant.name,
    slug: tenant.slug,
    is_active: tenant.is_active,
    messenger_page_id: tenant.messenger_page_id ?? "",
    messenger_username: tenant.messenger_username ?? "",
    messenger_redirect_mode: tenant.messenger_redirect_mode ?? "webhook",
    mapbox_enabled: tenant.mapbox_enabled,
    enable_order_management: tenant.enable_order_management,
    menu_engineering_enabled: tenant.menu_engineering_enabled,
    checkout_upsell_enabled: tenant.checkout_upsell_enabled,
    hide_currency_symbol: tenant.hide_currency_symbol,
    flash_screen_feature_enabled: tenant.flash_screen_feature_enabled,
    bundles_enabled: tenant.bundles_enabled,
    pairing_rules_enabled: tenant.pairing_rules_enabled,
    qr_handoff_enabled: tenant.qr_handoff_enabled,
    app_enabled: tenant.app_enabled,
    restaurant_address: tenant.restaurant_address ?? "",
    restaurant_latitude: numberToInput(tenant.restaurant_latitude),
    restaurant_longitude: numberToInput(tenant.restaurant_longitude),
    lalamove_enabled: tenant.lalamove_enabled,
    lalamove_api_key: tenant.lalamove_api_key ?? "",
    lalamove_secret_key: tenant.lalamove_secret_key ?? "",
    lalamove_market: tenant.lalamove_market ?? "PH",
    lalamove_service_type: tenant.lalamove_service_type ?? "MOTORCYCLE",
    lalamove_sandbox: tenant.lalamove_sandbox,
    lalamove_sender_phone: tenant.lalamove_sender_phone ?? "",
    distance_delivery_enabled: tenant.distance_delivery_enabled,
    delivery_price_per_km: numberToInput(tenant.delivery_price_per_km),
    delivery_min_fee: numberToInput(tenant.delivery_min_fee),
    delivery_radius_km: numberToInput(tenant.delivery_radius_km),
    convex_deployment_url: tenant.convex_deployment_url ?? "",
    convex_deploy_key: tenant.convex_deploy_key ?? "",
    admin_email: tenant.admin_email ?? "",
    email_notifications_enabled: tenant.email_notifications_enabled,
  };
}

function textToColumn(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function inputToNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Update payload for `tenants`. Never includes id or any branding column. */
export function toUpdatePayload(
  values: TenantFormValues
): Record<string, string | number | boolean | null> {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    is_active: values.is_active,
    messenger_page_id: textToColumn(values.messenger_page_id),
    messenger_username: textToColumn(values.messenger_username),
    messenger_redirect_mode: values.messenger_redirect_mode,
    mapbox_enabled: values.mapbox_enabled,
    enable_order_management: values.enable_order_management,
    menu_engineering_enabled: values.menu_engineering_enabled,
    checkout_upsell_enabled: values.checkout_upsell_enabled,
    hide_currency_symbol: values.hide_currency_symbol,
    flash_screen_feature_enabled: values.flash_screen_feature_enabled,
    bundles_enabled: values.bundles_enabled,
    pairing_rules_enabled: values.pairing_rules_enabled,
    qr_handoff_enabled: values.qr_handoff_enabled,
    app_enabled: values.app_enabled,
    restaurant_address: textToColumn(values.restaurant_address),
    restaurant_latitude: inputToNumber(values.restaurant_latitude),
    restaurant_longitude: inputToNumber(values.restaurant_longitude),
    lalamove_enabled: values.lalamove_enabled,
    lalamove_api_key: textToColumn(values.lalamove_api_key),
    lalamove_secret_key: textToColumn(values.lalamove_secret_key),
    lalamove_market: textToColumn(values.lalamove_market),
    lalamove_service_type: textToColumn(values.lalamove_service_type),
    lalamove_sandbox: values.lalamove_sandbox,
    lalamove_sender_phone: textToColumn(values.lalamove_sender_phone),
    distance_delivery_enabled: values.distance_delivery_enabled,
    delivery_price_per_km: inputToNumber(values.delivery_price_per_km),
    delivery_min_fee: inputToNumber(values.delivery_min_fee),
    delivery_radius_km: inputToNumber(values.delivery_radius_km),
    convex_deployment_url: textToColumn(values.convex_deployment_url),
    convex_deploy_key: textToColumn(values.convex_deploy_key),
    admin_email: textToColumn(values.admin_email),
    email_notifications_enabled: values.email_notifications_enabled,
  };
}

/** Positive-number check for a required numeric field. */
function checkNumber(
  raw: string,
  label: string,
  { min }: { min: number }
): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return `${label} is required`;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return `${label} must be a number`;
  if (parsed < min) return `${label} must be at least ${min}`;
  return undefined;
}

function checkCoordinate(
  raw: string,
  label: string,
  limit: number
): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return `${label} must be a number`;
  if (parsed < -limit || parsed > limit) {
    return `${label} must be between -${limit} and ${limit}`;
  }
  return undefined;
}

export function validateTenantForm(
  values: TenantFormValues
): TenantFormErrors {
  const errors: TenantFormErrors = {};

  if (values.name.trim() === "") errors.name = "Name is required";

  const slug = values.slug.trim();
  if (slug === "") {
    errors.slug = "Slug is required";
  } else if (RESERVED_SLUGS.includes(slug)) {
    errors.slug = `"${slug}" is a reserved subdomain`;
  } else if (!SLUG_PATTERN.test(slug)) {
    errors.slug = "Use lowercase letters, numbers and inner dashes only";
  }

  if (values.lalamove_enabled) {
    if (values.lalamove_api_key.trim() === "") {
      errors.lalamove_api_key = "API key is required when Lalamove is on";
    }
    if (values.lalamove_secret_key.trim() === "") {
      errors.lalamove_secret_key = "Secret key is required when Lalamove is on";
    }
  }

  if (values.distance_delivery_enabled) {
    errors.delivery_price_per_km = checkNumber(
      values.delivery_price_per_km,
      "Price per km",
      { min: 0 }
    );
    errors.delivery_min_fee = checkNumber(
      values.delivery_min_fee,
      "Minimum fee",
      { min: 0 }
    );
    // A zero radius would place every address out of range.
    errors.delivery_radius_km = checkNumber(
      values.delivery_radius_km,
      "Delivery radius",
      { min: 0.1 }
    );
  }

  errors.restaurant_latitude = checkCoordinate(
    values.restaurant_latitude,
    "Latitude",
    90
  );
  errors.restaurant_longitude = checkCoordinate(
    values.restaurant_longitude,
    "Longitude",
    180
  );

  // Drop the keys whose checks returned undefined so callers can treat an
  // empty object as "valid".
  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== undefined)
  ) as TenantFormErrors;
}

/**
 * Flip a feature flag, honouring declared dependencies: enabling a flag whose
 * prerequisite is off is a no-op, and turning a prerequisite off cascades to
 * its dependants — otherwise the row would persist a state the storefront can
 * never honour.
 */
export function applyFeatureToggle(
  values: TenantFormValues,
  key: TenantFeatureToggleKey,
  next: boolean
): TenantFormValues {
  const toggle = FEATURE_TOGGLES.find((f) => f.key === key);

  if (next && toggle?.requires && !values[toggle.requires]) {
    return values;
  }

  const updated: TenantFormValues = { ...values, [key]: next };

  if (next) return updated;

  const dependants = FEATURE_TOGGLES.filter((f) => f.requires === key);
  return dependants.reduce(
    (acc, dependant) => ({ ...acc, [dependant.key]: false }),
    updated
  );
}

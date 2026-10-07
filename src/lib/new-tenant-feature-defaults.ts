/**
 * The feature switches a brand-new store starts with.
 *
 * Everything that works without per-store setup starts ON. Two kinds stay off:
 * - QR-handoff ordering — it replaces the Messenger checkout, so a merchant
 *   opts into it deliberately.
 * - Lalamove, Loyverse and distance-based delivery — `tenantSchema` refuses
 *   them when on without credentials or pricing, so defaulting them on would
 *   make every create fail.
 *
 * Applied ONLY at creation. `tenantSchema` also parses every edit and keeps
 * its own defaults off, so an update that omits a flag never switches a live
 * store's feature on.
 */
export const NEW_TENANT_FEATURE_DEFAULTS = {
  mapbox_enabled: true,
  enable_order_management: true,
  menu_engineering_enabled: true,
  checkout_upsell_enabled: true,
  bundles_enabled: true,
  pairing_rules_enabled: true,
  modifier_groups_enabled: true,
  inventory_enabled: true,
  low_stock_alerts_enabled: true,
  auto_86_enabled: true,
  presell_enabled: true,
  multi_branch_enabled: true,
  flash_screen_feature_enabled: true,
  email_notifications_enabled: true,
  qr_handoff_enabled: false,
  // Rolled out store by store while the AI budget is tuned.
  assistant_enabled: false,
} as const

export type NewTenantFeatureDefaults = { -readonly [K in keyof typeof NEW_TENANT_FEATURE_DEFAULTS]: boolean }

/**
 * Fill every feature flag the caller left out with its new-store default.
 * A flag the caller set (true or false) is kept. Returns a new object.
 */
export function withNewTenantFeatureDefaults<T extends object>(input: T): NewTenantFeatureDefaults & T {
  const defined = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T
  return { ...NEW_TENANT_FEATURE_DEFAULTS, ...defined }
}

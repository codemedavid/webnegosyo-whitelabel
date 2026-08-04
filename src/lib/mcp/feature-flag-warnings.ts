/**
 * Tell the caller when a write it just made will be seen by nobody.
 *
 * Bundles and upsells are gated per tenant. Creating one while its flag is off
 * succeeds at the database and changes nothing on the storefront — and an AI
 * that reads its own tool result as truth cannot tell that apart from having
 * built the merchant a working promo. It reports success, moves on, and the
 * merchant finds an empty menu.
 *
 * The warning rides ON the result rather than replacing it with an error: the
 * row genuinely was written, and refusing would strand a caller deliberately
 * staging content before the feature is switched on.
 *
 * An ABSENT flag is treated as off, not on. These booleans are nullable columns
 * and a read that did not project them is unknown — assuming "on" is exactly the
 * assumption that produces the silent no-op this module exists to prevent.
 */

/** The per-tenant flag columns that gate the MCP's promo writes. */
export interface TenantFeatureFlags {
    bundles_enabled?: boolean | null
    menu_engineering_enabled?: boolean | null
    checkout_upsell_enabled?: boolean | null
}

export type GatedFeature = 'bundles' | 'upsells' | 'checkout_upsell'

const INERT = 'so it was saved but will NOT appear to customers until a superadmin turns that flag on'

/**
 * The warning a write to `feature` deserves given these flags, or null when the
 * feature is live.
 */
export function featureWarningFor(feature: GatedFeature, flags: TenantFeatureFlags): string | null {
    const bundles = flags.bundles_enabled === true
    const menuEngineering = flags.menu_engineering_enabled === true
    const checkoutUpsell = flags.checkout_upsell_enabled === true

    if (feature === 'bundles') {
        return bundles ? null : `This tenant has bundles_enabled OFF, ${INERT}.`
    }

    if (feature === 'upsells') {
        return menuEngineering ? null : `This tenant has menu_engineering_enabled OFF, ${INERT}.`
    }

    // checkout_upsell_enabled is nested under menu_engineering_enabled: with the
    // master flag off the nested one does nothing, so name the master switch or
    // the merchant is sent to the wrong control.
    if (!menuEngineering) {
        return `This tenant has menu_engineering_enabled OFF — the master flag the checkout interstitial depends on — ${INERT}.`
    }
    return checkoutUpsell ? null : `This tenant has checkout_upsell_enabled OFF, ${INERT}.`
}

/**
 * Return `result` with a `warning` attached when the feature it belongs to is
 * gated off. Never mutates the input.
 */
export function withFeatureWarning<T>(
    result: T,
    feature: GatedFeature,
    flags: TenantFeatureFlags,
): T | (Record<string, unknown> & { warning: string }) {
    const warning = featureWarningFor(feature, flags)
    if (!warning) return result

    const base = result && typeof result === 'object' ? (result as Record<string, unknown>) : { result }
    return { ...base, warning }
}

/**
 * The owner's own product page labels, for the modifier-group selector.
 * A label still at its table default is not passed on: the defaults were
 * written for the legacy sections ("* Pick 1", "(Optional)"), and the
 * modifier groups keep their standard rule wording until the owner types
 * their own.
 */

import type { SelectionRuleLabels } from '@/lib/modifier-groups'
import { DEFAULT_PRODUCT_DETAIL_SETTINGS, type ProductDetailColors } from '@/lib/product-detail-theme'

export interface ModifierLabels {
    rule: SelectionRuleLabels
    /** Replaces "No extra charge" / "Free" on ₱0 options. */
    freeLabel: string | undefined
}

function ownLabel(value: string, defaultValue: string | undefined): string | undefined {
    const trimmed = value.trim()
    return trimmed && trimmed !== defaultValue ? trimmed : undefined
}

export function modifierLabelsFrom(colors: ProductDetailColors): ModifierLabels {
    const defaults = DEFAULT_PRODUCT_DETAIL_SETTINGS
    const entries = [
        ['required', ownLabel(colors.variationRequiredText, defaults.variation_required_text)],
        ['optional', ownLabel(colors.variationOptionalText, defaults.variation_optional_text)],
        ['quantityOptional', ownLabel(colors.addonOptionalText, defaults.addon_optional_text)],
    ].filter(([, value]) => value !== undefined)
    return {
        rule: Object.fromEntries(entries) as SelectionRuleLabels,
        freeLabel: ownLabel(colors.addonPriceFreeText, defaults.addon_price_free_text),
    }
}

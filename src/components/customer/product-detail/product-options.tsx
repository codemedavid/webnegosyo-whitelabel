'use client'

import { memo, useMemo } from 'react'
import { AddonQuantityControl } from '@/components/customer/addon-quantity-control'
import { addonQuantity } from '@/lib/addon-quantity'
import { formatPrice } from '@/lib/cart-utils'
import type { Addon, MenuItem, Variation, VariationOption } from '@/types/database'
import type { ProductDetailColors } from '@/lib/product-detail-theme'
import { AdminEditPencil } from '@/components/customer/product-detail/admin-edit-pencil'

interface BrandingProps {
    themeColors: ProductDetailColors
    isBrandAdmin: boolean
    onEditBranding: (section: 'variations' | 'addons') => void
}

interface ProductVariationsProps extends BrandingProps {
    variations: Variation[]
    variationTypes: MenuItem['variation_types']
    selectedVariation: Variation | undefined
    selectedVariations: Record<string, VariationOption>
    onVariationTypeSelect: (typeId: string, option: VariationOption) => void
    onLegacyVariationSelect: (variation: Variation) => void
    dynamicStyles: Record<string, React.CSSProperties> | undefined
    menuEngineeringEnabled: boolean
}

/** Quantity and cart updates do not need to redraw unchanged option lists. */
export const ProductVariations = memo(function ProductVariations({
    variations, variationTypes, selectedVariation, selectedVariations,
    onVariationTypeSelect, onLegacyVariationSelect, dynamicStyles,
    menuEngineeringEnabled, themeColors, isBrandAdmin, onEditBranding,
}: ProductVariationsProps) {
    return <>
        {/* Variation Types (New System) */}
        {variationTypes?.map((variationType) => {
            const selectedOption = selectedVariations[variationType.id]

            return (
                <div
                    key={variationType.id}
                    data-branding-scope="product/variations"
                    className="mb-6"
                >
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                            <h3
                                className="text-base font-semibold"
                                style={{
                                    color: 'var(--pd-variation-title)',
                                    fontSize: 'var(--pd-variation-title-font-size)'
                                }}
                            >
                                {variationType.name}
                            </h3>
                            <span
                                className="text-xs font-medium px-2 py-0.5 rounded"
                                style={{ color: 'var(--pd-variation-required)' }}
                            >
                                {variationType.is_required ? themeColors.variationRequiredText : themeColors.variationOptionalText}
                            </span>
                        </div>
                        <AdminEditPencil
                            visible={isBrandAdmin}
                            onClick={() => onEditBranding('variations')}
                            label="Edit variation selector branding"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {variationType.options.map((option) => (
                            <VariationOptionButton
                                key={option.id}
                                option={option}
                                isSelected={selectedOption?.id === option.id}
                                typeId={variationType.id}
                                onSelect={onVariationTypeSelect}
                                dynamicStyles={dynamicStyles}
                                showUpgradeNudge={menuEngineeringEnabled}
                                currentPriceModifier={selectedOption?.price_modifier ?? 0}
                            />
                        ))}
                    </div>
                </div>
            )
        })}

        {/* Legacy Variations */}
        {!variationTypes?.length && variations.length > 0 && (
            <div className="mb-6">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                        <h3
                            className="text-base font-semibold"
                            style={{
                                color: 'var(--pd-variation-title)',
                                fontSize: 'var(--pd-variation-title-font-size)'
                            }}
                        >
                            Choose Size
                        </h3>
                        <span
                            className="text-xs font-medium px-2 py-0.5 rounded"
                            style={{ color: 'var(--pd-variation-required)' }}
                        >
                            {themeColors.variationRequiredText}
                        </span>
                    </div>
                    <AdminEditPencil
                        visible={isBrandAdmin}
                        onClick={() => onEditBranding('variations')}
                        label="Edit variation selector branding"
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    {variations.map((variation) => (
                        <LegacyVariationButton
                            key={variation.id}
                            variation={variation}
                            isSelected={selectedVariation?.id === variation.id}
                            onSelect={onLegacyVariationSelect}
                            dynamicStyles={dynamicStyles}
                        />
                    ))}
                </div>
            </div>
        )}

    </>
})

interface ProductAddonsProps extends BrandingProps {
    addons: Addon[]
    selectedAddons: Addon[]
    onQuantityChange: (addon: Addon, quantity: number) => void
    hideCurrencySymbol?: boolean
}

export const ProductAddons = memo(function ProductAddons({
    addons, selectedAddons, onQuantityChange, hideCurrencySymbol,
    themeColors, isBrandAdmin, onEditBranding,
}: ProductAddonsProps) {
    const quantities = useMemo(
        () => new Map(selectedAddons.map((addon) => [addon.id, addonQuantity(addon)])),
        [selectedAddons],
    )
    return <>
        {/* Add-ons */}
        {addons.length > 0 && (
            <div className="mb-6" data-branding-scope="product/addons">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <h3
                        className="text-base font-semibold"
                        style={{
                            color: 'var(--pd-addon-title)',
                            fontSize: 'var(--pd-addon-title-font-size)'
                        }}
                    >
                        Add-ons <span style={{ color: 'var(--pd-text-muted)' }} className="font-normal text-xs">{themeColors.addonOptionalText}</span>
                    </h3>
                    <AdminEditPencil
                        visible={isBrandAdmin}
                        onClick={() => onEditBranding('addons')}
                        label="Edit add-ons branding"
                    />
                </div>

                <p className="mb-3 text-xs opacity-70">Quantities are per item.</p>
                <div className="space-y-2">
                    {addons.map((addon) => (
                        <AddonQuantityControl
                            key={addon.id}
                            name={addon.name}
                            price={addon.price}
                            quantity={quantities.get(addon.id) ?? 0}
                            onChange={value => onQuantityChange(addon, value)}
                            hideCurrencySymbol={hideCurrencySymbol}
                        />
                    ))}
                </div>
            </div>
        )}

    </>
})

// Memoized Variation Option Button Component
interface VariationOptionButtonProps {
    option: VariationOption
    isSelected: boolean
    typeId: string
    onSelect: (typeId: string, option: VariationOption) => void
    dynamicStyles: Record<string, React.CSSProperties> | undefined
    showUpgradeNudge?: boolean
    currentPriceModifier?: number
}

const VariationOptionButton = memo(function VariationOptionButton({
    option,
    typeId,
    isSelected,
    onSelect,
    dynamicStyles,
    showUpgradeNudge,
    currentPriceModifier = 0,
}: VariationOptionButtonProps) {
    const upgradeAmount = option.price_modifier - currentPriceModifier
    return (
        <button
            type="button"
            data-branding-scope="product/variation-option"
            onClick={() => onSelect(typeId, option)}
            className="px-4 py-2.5 text-sm font-medium transition-all duration-150 border active:scale-[0.95]"
            style={isSelected ? dynamicStyles?.variationButtonSelected : dynamicStyles?.variationButton}
        >
            <span className="font-semibold">{option.name}</span>
            {option.price_modifier !== 0 && (
                <span className="ml-1 opacity-90" style={{ color: 'var(--pd-variation-price)' }}>
        (+{formatPrice(option.price_modifier)})
                </span>
            )}
            {showUpgradeNudge && !isSelected && option.is_upgrade_target && upgradeAmount > 0 && (
                <span
        className="ml-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{
            backgroundColor: 'var(--pd-button-primary, var(--button-primary))',
            color: 'var(--pd-button-primary-text, #fff)',
            opacity: 0.85,
        }}
                >
        Upgrade +{formatPrice(upgradeAmount)}
                </span>
            )}
        </button>
    )
})

// Memoized Legacy Variation Button Component
interface LegacyVariationButtonProps {
    variation: Variation
    isSelected: boolean
    onSelect: (variation: Variation) => void
    dynamicStyles: Record<string, React.CSSProperties> | undefined
}

const LegacyVariationButton = memo(function LegacyVariationButton({
    variation,
    isSelected,
    onSelect,
    dynamicStyles
}: LegacyVariationButtonProps) {
    return (
        <button
            type="button"
            data-branding-scope="product/variation-option"
            onClick={() => onSelect(variation)}
            className="px-4 py-2.5 text-sm font-medium transition-all duration-150 border active:scale-[0.95]"
            style={isSelected ? dynamicStyles?.variationButtonSelected : dynamicStyles?.variationButton}
        >
            <span className="font-semibold">{variation.name}</span>
            {variation.price_modifier !== 0 && (
                <span className="ml-1 opacity-90" style={{ color: 'var(--pd-variation-price)' }}>
        (+{formatPrice(variation.price_modifier)})
                </span>
            )}
        </button>
    )
})

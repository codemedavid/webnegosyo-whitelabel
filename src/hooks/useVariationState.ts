import { useState, useEffect, useMemo, useCallback } from 'react'
import { calculateCartItemSubtotal } from '@/lib/cart-utils'
import type { MenuItem, Variation, Addon, VariationOption, Category } from '@/types/database'

interface UseVariationStateOptions {
    item: MenuItem
    category?: Category | null
}

export function useVariationState({ item, category }: UseVariationStateOptions) {
    // Legacy single variation
    const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>()
    // New grouped variations: map of type ID -> selected option
    const [selectedVariations, setSelectedVariations] = useState<{ [typeId: string]: VariationOption }>({})
    const [selectedAddons, setSelectedAddons] = useState<Addon[]>([])
    const [quantity, setQuantity] = useState(1)

    // Determine if using new or legacy variation system - memoized
    const useNewVariations = useMemo(() =>
        item.variation_types && item.variation_types.length > 0,
        [item.variation_types]
    )

    // Computed boolean flags
    const hasVariations = useMemo(() => item.variations.length > 0, [item.variations.length])
    const hasVariationTypes = useMemo(() =>
        item.variation_types && item.variation_types.length > 0,
        [item.variation_types]
    )

    // Merge item add-ons with category default add-ons (item-level wins on name conflict)
    const mergedAddons = useMemo(() => {
        const categoryAddons = category?.default_addons || []
        if (categoryAddons.length === 0) return item.addons

        const itemAddonNames = new Set(item.addons.map(a => a.name.toLowerCase()))
        const uniqueCategoryAddons = categoryAddons.filter(
            a => !itemAddonNames.has(a.name.toLowerCase())
        )
        return [...item.addons, ...uniqueCategoryAddons]
    }, [item.addons, category?.default_addons])

    const hasAddons = useMemo(() => mergedAddons.length > 0, [mergedAddons.length])
    const hasCustomizations = useMemo(() =>
        hasVariations || hasVariationTypes || hasAddons,
        [hasVariations, hasVariationTypes, hasAddons]
    )

    const hasDiscount = useMemo(() =>
        item.discounted_price && item.discounted_price < item.price,
        [item.discounted_price, item.price]
    )

    const basePrice = useMemo(() =>
        hasDiscount ? item.discounted_price! : item.price,
        [hasDiscount, item.discounted_price, item.price]
    )

    // Calculate total price based on which variation system is used
    const totalPrice = useMemo(() =>
        useNewVariations
            ? calculateCartItemSubtotal(basePrice, selectedVariations, selectedAddons, quantity)
            : calculateCartItemSubtotal(basePrice, selectedVariation, selectedAddons, quantity),
        [useNewVariations, basePrice, selectedVariations, selectedVariation, selectedAddons, quantity]
    )

    // Initialize/reset default selections when item changes
    useEffect(() => {
        // Reset legacy variations
        if (item.variations && item.variations.length > 0) {
            const defaultVar = item.variations.find((v) => v.is_default) || item.variations[0]
            setSelectedVariation(defaultVar)
        } else {
            setSelectedVariation(undefined)
        }

        // Reset new variation types
        if (item.variation_types && item.variation_types.length > 0) {
            const defaults: { [typeId: string]: VariationOption } = {}
            item.variation_types.forEach(type => {
                if (type.options.length > 0) {
                    const defaultOption = type.options.find(opt => opt.is_default) || type.options[0]
                    defaults[type.id] = defaultOption
                }
            })
            setSelectedVariations(defaults)
        } else {
            setSelectedVariations({})
        }

        // Reset addons and quantity when product changes
        setSelectedAddons([])
        setQuantity(1)
    }, [item.id, item.variations, item.variation_types])

    // Selection handlers
    const handleVariationTypeSelect = useCallback((typeId: string, option: VariationOption) => {
        setSelectedVariations(prev => ({ ...prev, [typeId]: option }))
    }, [])

    const handleLegacyVariationSelect = useCallback((variation: Variation) => {
        setSelectedVariation(variation)
    }, [])

    const toggleAddon = useCallback((addon: Addon) => {
        setSelectedAddons((prev) => {
            const exists = prev.find((a) => a.id === addon.id)
            if (exists) {
                return prev.filter((a) => a.id !== addon.id)
            }
            return [...prev, addon]
        })
    }, [])

    const handleDecreaseQuantity = useCallback(() => {
        setQuantity(prev => Math.max(1, prev - 1))
    }, [])

    const handleIncreaseQuantity = useCallback(() => {
        setQuantity(prev => Math.min(prev + 1, 99))
    }, [])

    return {
        // State
        selectedVariation,
        selectedVariations,
        selectedAddons,
        quantity,

        // Computed
        useNewVariations,
        hasVariations,
        hasVariationTypes,
        hasAddons,
        hasCustomizations,
        hasDiscount,
        basePrice,
        totalPrice,
        mergedAddons,

        // Handlers
        handleVariationTypeSelect,
        handleLegacyVariationSelect,
        toggleAddon,
        handleDecreaseQuantity,
        handleIncreaseQuantity,
    }
}

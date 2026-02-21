import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { View, ScrollView, Text, StyleSheet, Dimensions } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/theme/provider'
import { useMenuItem } from '@/lib/queries/use-menu-items'
import { useProductDetailSettings } from '@/lib/queries/use-product-detail-settings'
import { mergeSettingsWithBranding } from '@/lib/product-detail-theme'
import { useCartStore } from '@/stores/cart-store'
import { calculateCartItemSubtotal, formatPrice } from '@/lib/cart-utils'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { VariationSelector } from '@/components/product-detail/variation-selector'
import { AddonSelector } from '@/components/product-detail/addon-selector'
import { QuantitySelector } from '@/components/product-detail/quantity-selector'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Variation, VariationOption, Addon } from '@/types/database'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export default function ProductDetailScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>()
  const { theme, tenant } = useTheme()
  const { data: item, isLoading } = useMenuItem(itemId)
  const { data: pdSettings } = useProductDetailSettings(tenant?.id)
  const addItem = useCartStore(s => s.addItem)

  const pdColors = useMemo(
    () => mergeSettingsWithBranding(pdSettings ?? null, theme),
    [pdSettings, theme]
  )

  const hideCurrencySymbol = tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol

  const hasGroupedVariations = item?.variation_types && item.variation_types.length > 0
  const hasLegacyVariations = item?.variations && item.variations.length > 0
  const hasVariations = hasGroupedVariations || hasLegacyVariations
  const hasAddons = item?.addons && item.addons.length > 0
  const hasCustomizations = hasVariations || hasAddons

  const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>()
  const [selectedVariations, setSelectedVariations] = useState<{ [typeId: string]: VariationOption }>({})
  const [selectedAddons, setSelectedAddons] = useState<Addon[]>([])
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    if (!item) return

    if (hasGroupedVariations && item.variation_types) {
      const defaults: { [typeId: string]: VariationOption } = {}
      item.variation_types.forEach(type => {
        const defaultOption = type.options.find(o => o.is_default) || type.options[0]
        if (defaultOption) defaults[type.id] = defaultOption
      })
      setSelectedVariations(defaults)
    } else if (hasLegacyVariations && item.variations) {
      const defaultVar = item.variations.find(v => v.is_default) || item.variations[0]
      setSelectedVariation(defaultVar)
    }

    const defaultAddons = item.addons?.filter(a => a.is_default) || []
    setSelectedAddons(defaultAddons)
    setQuantity(1)
  }, [item?.id])

  const effectivePrice = item ? (item.discounted_price ?? item.price) : 0
  const hasDiscount = item && item.discounted_price != null && item.discounted_price < item.price

  const subtotal = useMemo(() => {
    if (!item) return 0
    const variationOrVariations = hasGroupedVariations ? selectedVariations : selectedVariation
    return calculateCartItemSubtotal(effectivePrice, variationOrVariations, selectedAddons, quantity)
  }, [item, selectedVariation, selectedVariations, selectedAddons, quantity, effectivePrice])

  // Generate selected summary text (like the web)
  const selectedSummary = useMemo(() => {
    const parts: string[] = []

    if (hasGroupedVariations && item?.variation_types) {
      item.variation_types.forEach(type => {
        const selected = selectedVariations[type.id]
        if (selected) parts.push(selected.name)
      })
    } else if (selectedVariation) {
      parts.push(selectedVariation.name)
    }

    if (selectedAddons.length > 0) {
      parts.push(...selectedAddons.map(a => a.name))
    }

    return parts.length > 0 ? parts.join(', ') : pdColors.footerEmptySummaryText
  }, [hasGroupedVariations, item?.variation_types, selectedVariations, selectedVariation, selectedAddons, pdColors.footerEmptySummaryText])

  const handleToggleAddon = useCallback((addon: Addon) => {
    setSelectedAddons(prev =>
      prev.some(a => a.id === addon.id)
        ? prev.filter(a => a.id !== addon.id)
        : [...prev, addon]
    )
  }, [])

  const handleGroupedVariationSelect = useCallback((typeId: string, option: VariationOption) => {
    setSelectedVariations(prev => ({ ...prev, [typeId]: option }))
  }, [])

  const handleAddToCart = useCallback(() => {
    if (!item) return
    const v = hasGroupedVariations ? selectedVariations : selectedVariation
    addItem(item, v, selectedAddons, quantity)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    router.back()
  }, [item, selectedVariation, selectedVariations, selectedAddons, quantity, addItem])

  const handleBuyNow = useCallback(() => {
    if (!item) return
    const v = hasGroupedVariations ? selectedVariations : selectedVariation
    addItem(item, v, selectedAddons, quantity)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    router.push('/(main)/cart')
  }, [item, selectedVariation, selectedVariations, selectedAddons, quantity, addItem])

  if (isLoading || !item) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Skeleton width={SCREEN_WIDTH} height={SCREEN_WIDTH * 0.75} borderRadius={0} />
        <View style={styles.loadingContent}>
          <Skeleton width="60%" height={28} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={18} style={{ marginBottom: 8 }} />
          <Skeleton width="80%" height={18} style={{ marginBottom: 16 }} />
          <Skeleton width="100%" height={60} />
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: pdColors.pageBackground }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hero Image with background color (matches web's --pd-image-background) */}
        <View style={[styles.heroImageContainer, { backgroundColor: pdColors.imageBackground }, { paddingTop: 100 }]}>
          <OptimizedImage source={item.image_url} style={styles.heroImage} />
        </View>

        {/* Product Info — centered like the web */}
        <View style={styles.content}>
          {/* Breadcrumb: category path */}
          {item.category_id ? (
            <Text style={[styles.breadcrumb, { color: pdColors.breadcrumb }]}>
              Home / Menu / {item.name}
            </Text>
          ) : null}

          {/* Name */}
          <Text style={[styles.name, { color: pdColors.productName }]}>
            {item.name}{item.is_featured ? ' ★' : ''}
          </Text>

          {/* Description */}
          {item.description ? (
            <Text style={[styles.description, { color: pdColors.description }]}>
              {item.description}
            </Text>
          ) : null}

          {/* Size/variant summary line (like the web) */}
          {hasLegacyVariations && item.variations ? (
            <Text style={[styles.variantSummary, { color: pdColors.originalPrice }]}>
              {item.variations.map(v => v.name).join(' | ')}
            </Text>
          ) : null}

          {/* Divider before customizations */}
          {hasCustomizations ? (
            <View style={[styles.divider, { backgroundColor: pdColors.border }]} />
          ) : null}

          {/* Variations */}
          {hasGroupedVariations && item.variation_types ? (
            <VariationSelector
              format="grouped"
              variationTypes={item.variation_types}
              selectedVariations={selectedVariations}
              onSelect={handleGroupedVariationSelect}
              hideCurrencySymbol={hideCurrencySymbol || false}
              pdColors={pdColors}
            />
          ) : hasLegacyVariations && item.variations ? (
            <VariationSelector
              format="legacy"
              variations={item.variations}
              selectedVariation={selectedVariation}
              onSelect={setSelectedVariation}
              hideCurrencySymbol={hideCurrencySymbol || false}
              pdColors={pdColors}
            />
          ) : null}

          {/* Add-ons */}
          {item.addons && item.addons.length > 0 ? (
            <AddonSelector
              addons={item.addons}
              selectedAddons={selectedAddons}
              onToggle={handleToggleAddon}
              hideCurrencySymbol={hideCurrencySymbol || false}
              pdColors={pdColors}
            />
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky Footer — matching the web layout */}
      <View style={[styles.footer, { backgroundColor: pdColors.footerBackground, borderTopColor: pdColors.footerBorder }]}>
        {/* Selected summary */}
        <Text style={[styles.summaryText, { color: pdColors.summaryText }]} numberOfLines={1}>
          {selectedSummary}
        </Text>

        {/* Price + Quantity row */}
        <View style={styles.footerPriceRow}>
          <View style={styles.priceColumn}>
            {hasDiscount ? (
              <Text style={[styles.footerOriginalPrice, { color: pdColors.originalPrice }]}>
                {formatPrice(item.price * quantity, { hideCurrencySymbol: hideCurrencySymbol || false })}
              </Text>
            ) : null}
            <Text style={[styles.footerPrice, { color: pdColors.totalPrice }]}>
              {formatPrice(subtotal, { hideCurrencySymbol: hideCurrencySymbol || false })}
            </Text>
          </View>
          <QuantitySelector
            quantity={quantity}
            onIncrement={() => setQuantity(q => q + 1)}
            onDecrement={() => setQuantity(q => Math.max(1, q - 1))}
            pdColors={pdColors}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.footerButtons}>
          <Button
            title={pdColors.buyNowButtonLabel}
            variant="outline"
            onPress={handleBuyNow}
            style={{
              flex: 1,
              backgroundColor: pdColors.buyNowButtonBackground,
              borderColor: pdColors.buyNowButtonBorder,
            }}
            textStyle={{ color: pdColors.buyNowButtonText }}
          />
          <Button
            title={pdColors.addToCartButtonLabel}
            onPress={handleAddToCart}
            style={{
              flex: 1,
              backgroundColor: pdColors.addToCartButtonBackground,
            }}
            textStyle={{ color: pdColors.addToCartButtonText }}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 200 },
  heroImageContainer: { paddingTop: 16 },
  heroImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.75 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  loadingContent: { padding: 20 },

  // Breadcrumb
  breadcrumb: {
    fontSize: 12,
    marginBottom: 10,
  },

  // Name — centered and bold like the web
  name: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },

  // Description — centered, relaxed line height
  description: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 12,
  },

  // Variant summary (e.g. "Iced 16oz | Hot 12oz")
  variantSummary: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },

  // Divider
  divider: {
    height: 1,
    marginVertical: 16,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 5,
  },
  summaryText: {
    fontSize: 12,
    marginBottom: 4,
  },
  footerPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  priceColumn: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  footerOriginalPrice: {
    fontSize: 13,
    textDecorationLine: 'line-through',
  },
  footerPrice: {
    fontSize: 22,
    fontWeight: '800',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
})

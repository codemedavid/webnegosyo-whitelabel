import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/theme/provider'
import { setAlpha } from '@/lib/branding-utils'
import { formatPrice } from '@/lib/cart-utils'
import type { Variation, VariationType, VariationOption } from '@/types/database'
import type { ProductDetailColors } from '@/lib/product-detail-theme'

interface LegacyVariationSelectorProps {
  format: 'legacy'
  variations: Variation[]
  selectedVariation: Variation | undefined
  onSelect: (variation: Variation) => void
  hideCurrencySymbol?: boolean
  pdColors?: ProductDetailColors
}

interface GroupedVariationSelectorProps {
  format: 'grouped'
  variationTypes: VariationType[]
  selectedVariations: { [typeId: string]: VariationOption }
  onSelect: (typeId: string, option: VariationOption) => void
  hideCurrencySymbol?: boolean
  pdColors?: ProductDetailColors
}

type VariationSelectorProps = LegacyVariationSelectorProps | GroupedVariationSelectorProps

export function VariationSelector(props: VariationSelectorProps) {
  const { theme } = useTheme()
  const pd = props.pdColors

  const titleColor = pd?.variationSectionTitle ?? theme.cardTitle
  const requiredColor = pd?.variationRequiredBadge ?? theme.textMuted
  const optionBgUnselected = pd?.variationOptionBackground ?? theme.cards
  const optionTextUnselected = pd?.variationOptionText ?? theme.cardTitle
  const optionBorderUnselected = pd?.variationOptionBorder ?? theme.border
  const optionBgSelected = pd?.variationOptionSelectedBackground ?? setAlpha(theme.buttonPrimary, 0.08)
  const optionTextSelected = pd?.variationOptionSelectedText ?? theme.buttonPrimary
  const optionBorderSelected = pd?.variationOptionSelectedBorder ?? theme.buttonPrimary
  const priceColor = pd?.variationPriceModifier ?? theme.cardDescription
  const requiredText = pd?.variationRequiredText ?? '* Pick 1'
  const optionalText = pd?.variationOptionalText ?? 'Optional'

  if (props.format === 'legacy') {
    const { variations, selectedVariation, onSelect, hideCurrencySymbol } = props
    if (variations.length === 0) return null

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: titleColor }]}>
            {variations.map(v => v.name).join(' | ')}
          </Text>
          <Text style={[styles.required, { color: requiredColor }]}>{requiredText}</Text>
        </View>
        <View style={styles.options}>
          {variations.map((variation) => {
            const isSelected = selectedVariation?.id === variation.id
            return (
              <TouchableOpacity
                key={variation.id}
                style={[
                  styles.option,
                  {
                    backgroundColor: isSelected ? optionBgSelected : optionBgUnselected,
                    borderColor: isSelected ? optionBorderSelected : optionBorderUnselected,
                  },
                ]}
                onPress={() => onSelect(variation)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionName,
                    { color: isSelected ? optionTextSelected : optionTextUnselected },
                  ]}
                >
                  {variation.name}
                </Text>
                {variation.price_modifier > 0 ? (
                  <Text
                    style={[
                      styles.optionPrice,
                      { color: isSelected ? optionTextSelected : priceColor },
                    ]}
                  >
                    +{formatPrice(variation.price_modifier, { hideCurrencySymbol })}
                  </Text>
                ) : null}
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    )
  }

  // Grouped format
  const { variationTypes, selectedVariations, onSelect, hideCurrencySymbol } = props
  if (variationTypes.length === 0) return null

  return (
    <View>
      {variationTypes
        .sort((a, b) => a.display_order - b.display_order)
        .map((type) => (
          <View key={type.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: titleColor }]}>
                {type.name}
              </Text>
              {type.is_required ? (
                <Text style={[styles.required, { color: requiredColor }]}>{requiredText}</Text>
              ) : (
                <Text style={[styles.required, { color: requiredColor }]}>{optionalText}</Text>
              )}
            </View>
            <View style={styles.options}>
              {type.options
                .sort((a, b) => a.display_order - b.display_order)
                .map((option) => {
                  const isSelected = selectedVariations[type.id]?.id === option.id
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.option,
                        {
                          backgroundColor: isSelected ? optionBgSelected : optionBgUnselected,
                          borderColor: isSelected ? optionBorderSelected : optionBorderUnselected,
                        },
                      ]}
                      onPress={() => onSelect(type.id, option)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.optionName,
                          { color: isSelected ? optionTextSelected : optionTextUnselected },
                        ]}
                      >
                        {option.name}
                      </Text>
                      {option.price_modifier > 0 ? (
                        <Text
                          style={[
                            styles.optionPrice,
                            { color: isSelected ? optionTextSelected : priceColor },
                          ]}
                        >
                          +{formatPrice(option.price_modifier, { hideCurrencySymbol })}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  )
                })}
            </View>
          </View>
        ))}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  required: {
    fontSize: 12,
    fontWeight: '500',
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  option: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    minWidth: 72,
    alignItems: 'center',
  },
  optionName: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionPrice: {
    fontSize: 11,
    marginTop: 2,
  },
})

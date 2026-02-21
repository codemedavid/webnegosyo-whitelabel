import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/provider'
import { formatPrice } from '@/lib/cart-utils'
import type { Addon } from '@/types/database'
import type { ProductDetailColors } from '@/lib/product-detail-theme'

interface AddonSelectorProps {
  addons: Addon[]
  selectedAddons: Addon[]
  onToggle: (addon: Addon) => void
  hideCurrencySymbol?: boolean
  pdColors?: ProductDetailColors
}

export function AddonSelector({ addons, selectedAddons, onToggle, hideCurrencySymbol, pdColors }: AddonSelectorProps) {
  const { theme } = useTheme()
  const pd = pdColors

  const titleColor = pd?.addonSectionTitle ?? theme.cardTitle
  const bgUnselected = pd?.addonBackground ?? theme.cards
  const borderUnselected = pd?.addonBorder ?? theme.border
  const bgSelected = pd?.addonSelectedBackground ?? theme.cards
  const borderSelected = pd?.addonSelectedBorder ?? theme.buttonPrimary
  const checkBg = pd?.addonSelectedCheck ?? theme.buttonPrimary
  const checkIcon = '#ffffff'
  const nameUnselected = pd?.addonText ?? theme.cardTitle
  const nameSelected = pd?.addonSelectedText ?? theme.cardTitle
  const priceColor = pd?.addonPrice ?? theme.cardDescription
  const freeText = pd?.addonPriceFreeText ?? 'Free'
  const optionalText = pd?.addonOptionalText ?? '(Optional)'

  if (addons.length === 0) return null

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: titleColor }]}>
          Add-ons
        </Text>
        <Text style={[styles.optional, { color: pd?.textMuted ?? theme.textMuted }]}>{optionalText}</Text>
      </View>
      <View style={styles.addons}>
        {addons.map((addon) => {
          const isSelected = selectedAddons.some(a => a.id === addon.id)
          return (
            <TouchableOpacity
              key={addon.id}
              style={[
                styles.addon,
                {
                  backgroundColor: isSelected ? bgSelected : bgUnselected,
                  borderColor: isSelected ? borderSelected : borderUnselected,
                },
              ]}
              onPress={() => onToggle(addon)}
              activeOpacity={0.7}
            >
              <View style={styles.addonLeft}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: isSelected ? checkBg : 'transparent',
                      borderColor: isSelected ? checkBg : borderUnselected,
                    },
                  ]}
                >
                  {isSelected ? (
                    <Ionicons name="checkmark" size={14} color={checkIcon} />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.addonName,
                    { color: isSelected ? nameSelected : nameUnselected },
                  ]}
                >
                  {addon.name}
                </Text>
              </View>
              <Text
                style={[
                  styles.addonPrice,
                  { color: priceColor },
                ]}
              >
                {addon.price === 0 ? freeText : `+${formatPrice(addon.price, { hideCurrencySymbol })}`}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  optional: {
    fontSize: 12,
    fontWeight: '400',
  },
  addons: { gap: 8 },
  addon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  addonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addonName: {
    fontSize: 14,
    fontWeight: '500',
  },
  addonPrice: {
    fontSize: 14,
    fontWeight: '600',
  },
})

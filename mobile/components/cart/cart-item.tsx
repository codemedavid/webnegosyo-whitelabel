import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/provider'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { QuantitySelector } from '@/components/product-detail/quantity-selector'
import { formatPrice } from '@/lib/cart-utils'
import type { CartItem as CartItemType } from '@/types/database'

interface CartItemProps {
  item: CartItemType
  onUpdateQuantity: (quantity: number) => void
  onRemove: () => void
  hideCurrencySymbol?: boolean
}

export function CartItemCard({ item, onUpdateQuantity, onRemove, hideCurrencySymbol }: CartItemProps) {
  const { theme } = useTheme()

  const variationText = item.selected_variations
    ? Object.values(item.selected_variations).map(o => o.name).join(', ')
    : item.selected_variation?.name || ''

  const addonsText = item.selected_addons.map(a => a.name).join(', ')

  return (
    <View style={[styles.container, { backgroundColor: theme.cards, borderColor: theme.border }]}>
      <View style={styles.row}>
        <OptimizedImage source={item.menu_item.image_url} style={styles.image} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>
              {item.menu_item.name}
            </Text>
            <TouchableOpacity onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="trash-outline" size={18} color={theme.error} />
            </TouchableOpacity>
          </View>
          {variationText ? (
            <Text style={[styles.detail, { color: theme.textSecondary }]}>{variationText}</Text>
          ) : null}
          {addonsText ? (
            <Text style={[styles.detail, { color: theme.textSecondary }]}>+ {addonsText}</Text>
          ) : null}
          {item.special_instructions ? (
            <Text style={[styles.detail, { color: theme.textMuted }]} numberOfLines={1}>
              Note: {item.special_instructions}
            </Text>
          ) : null}
          <View style={styles.bottomRow}>
            <Text style={[styles.price, { color: theme.cardPrice }]}>
              {formatPrice(item.subtotal, { hideCurrencySymbol })}
            </Text>
            <QuantitySelector
              quantity={item.quantity}
              onIncrement={() => onUpdateQuantity(item.quantity + 1)}
              onDecrement={() => onUpdateQuantity(item.quantity - 1)}
            />
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  row: { flexDirection: 'row', gap: 12 },
  image: { width: 72, height: 72, borderRadius: 10 },
  info: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  name: { fontSize: 15, fontWeight: '600', flex: 1 },
  detail: { fontSize: 12, marginTop: 2 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  price: { fontSize: 16, fontWeight: '700' },
})

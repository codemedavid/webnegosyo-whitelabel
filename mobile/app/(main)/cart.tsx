import React from 'react'
import { View, FlatList, Text, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, CART_BRANDING_OVERRIDES } from '@/theme/provider'
import { useCartStore, useCartHydrated } from '@/stores/cart-store'
import { CartItemCard } from '@/components/cart/cart-item'
import { CartSummary } from '@/components/cart/cart-summary'
import { Button } from '@/components/ui/button'

export default function CartScreen() {
  const { theme, tenant } = useTheme()
  const isCartHydrated = useCartHydrated()
  const { items, total, itemCount, updateQuantity, removeItem } = useCartStore()
  const orderType = useCartStore(s => s.orderType)
  const hideCurrencySymbol = tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol
  const cartIconName = CART_BRANDING_OVERRIDES.iconName && CART_BRANDING_OVERRIDES.iconName in Ionicons.glyphMap
    ? CART_BRANDING_OVERRIDES.iconName as keyof typeof Ionicons.glyphMap
    : 'cart-outline'
  const emptyIconColor = CART_BRANDING_OVERRIDES.emptyIconColor || CART_BRANDING_OVERRIDES.iconColor || theme.textMuted
  const emptyTitle = CART_BRANDING_OVERRIDES.emptyTitle || 'Your cart is empty'
  const emptySubtitle = CART_BRANDING_OVERRIDES.emptySubtitle || 'Add items from the menu to get started'
  const browseMenuButtonText = CART_BRANDING_OVERRIDES.browseButtonText || 'Browse Menu'
  const checkoutButtonText = CART_BRANDING_OVERRIDES.checkoutButtonText || 'Checkout'

  if (items.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
        <Ionicons name={cartIconName} size={64} color={emptyIconColor} />
        <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{emptyTitle}</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          {emptySubtitle}
        </Text>
        <Button
          title={browseMenuButtonText}
          onPress={() => router.back()}
          style={{ marginTop: 20 }}
        />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CartItemCard
            item={item}
            onUpdateQuantity={(qty) => updateQuantity(item.id, qty)}
            onRemove={() => removeItem(item.id)}
            hideCurrencySymbol={hideCurrencySymbol || false}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <CartSummary subtotal={total} hideCurrencySymbol={hideCurrencySymbol || false} />
        }
      />

      <View style={[styles.footer, { backgroundColor: theme.cards, borderTopColor: theme.border }]}>
        <Button
          title={`${checkoutButtonText} (${itemCount} items)`}
          onPress={() => {
            if (!isCartHydrated || !orderType) {
              router.replace('/(main)/home')
              return
            }
            router.push('/(main)/checkout')
          }}
          fullWidth
          size="lg"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptySubtitle: { fontSize: 14, marginTop: 6, textAlign: 'center' },
  list: { paddingTop: 16, paddingBottom: 120 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopWidth: 1,
  },
})

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/theme/provider'
import { formatPrice } from '@/lib/cart-utils'

interface CartSummaryProps {
  subtotal: number
  deliveryFee?: number
  hideCurrencySymbol?: boolean
  useCheckoutTheme?: boolean
}

export function CartSummary({ subtotal, deliveryFee, hideCurrencySymbol, useCheckoutTheme }: CartSummaryProps) {
  const { theme } = useTheme()
  const total = subtotal + (deliveryFee || 0)

  const colors = useCheckoutTheme ? {
    label: theme.checkoutModalDescription,
    value: theme.checkoutModalTitle,
    totalLabel: theme.checkoutModalTitle,
    totalValue: theme.checkoutModalPrice,
    border: theme.checkoutModalBorder,
  } : {
    label: theme.textSecondary,
    value: theme.textPrimary,
    totalLabel: theme.textPrimary,
    totalValue: theme.buttonPrimary,
    border: theme.border,
  }

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.label }]}>Subtotal</Text>
        <Text style={[styles.value, { color: colors.value }]}>
          {formatPrice(subtotal, { hideCurrencySymbol })}
        </Text>
      </View>
      {deliveryFee != null && deliveryFee > 0 ? (
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.label }]}>Delivery Fee</Text>
          <Text style={[styles.value, { color: colors.value }]}>
            {formatPrice(deliveryFee, { hideCurrencySymbol })}
          </Text>
        </View>
      ) : null}
      <View style={[styles.row, styles.totalRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.totalLabel, { color: colors.totalLabel }]}>Total</Text>
        <Text style={[styles.totalValue, { color: colors.totalValue }]}>
          {formatPrice(total, { hideCurrencySymbol })}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 14 },
  value: { fontSize: 14, fontWeight: '500' },
  totalRow: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: { fontSize: 17, fontWeight: '700' },
  totalValue: { fontSize: 20, fontWeight: '800' },
})

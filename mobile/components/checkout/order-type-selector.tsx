import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/provider'
import type { OrderType } from '@/types/database'

interface OrderTypeSelectorProps {
  orderTypes: OrderType[]
  selectedId: string | null
  onSelect: (orderType: OrderType) => void
  checkoutTheme?: boolean
}

const ORDER_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  dine_in: 'restaurant-outline',
  pickup: 'bag-handle-outline',
  delivery: 'bicycle-outline',
}

export function OrderTypeSelector({ orderTypes, selectedId, onSelect, checkoutTheme }: OrderTypeSelectorProps) {
  const { theme } = useTheme()

  // Use checkout-specific tokens when rendered on the checkout page
  const colors = checkoutTheme ? {
    title: theme.checkoutModalTitle,
    cardBg: theme.checkoutModalBackground,
    cardBorder: theme.checkoutModalBorder,
    cardSelectedBg: theme.checkoutModalButton,
    cardSelectedBorder: theme.checkoutModalButton,
    cardText: theme.checkoutModalTitle,
    cardSelectedText: theme.checkoutModalButtonText,
    cardDesc: theme.checkoutModalDescription,
    cardSelectedDesc: theme.checkoutModalButtonText,
  } : {
    title: theme.textPrimary,
    cardBg: theme.cards,
    cardBorder: theme.border,
    cardSelectedBg: theme.buttonPrimary,
    cardSelectedBorder: theme.buttonPrimary,
    cardText: theme.textPrimary,
    cardSelectedText: theme.buttonPrimaryText,
    cardDesc: theme.textSecondary,
    cardSelectedDesc: theme.buttonPrimaryText,
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.title }]}>Order Type</Text>
      <View style={styles.grid}>
        {orderTypes.map((orderType) => {
          const isSelected = selectedId === orderType.id
          const icon = ORDER_TYPE_ICONS[orderType.type] || 'receipt-outline'

          return (
            <TouchableOpacity
              key={orderType.id}
              style={[
                styles.card,
                {
                  backgroundColor: isSelected ? colors.cardSelectedBg : colors.cardBg,
                  borderColor: isSelected ? colors.cardSelectedBorder : colors.cardBorder,
                },
              ]}
              onPress={() => onSelect(orderType)}
            >
              <Ionicons
                name={icon}
                size={28}
                color={isSelected ? colors.cardSelectedText : colors.cardText}
              />
              <Text
                style={[
                  styles.cardName,
                  { color: isSelected ? colors.cardSelectedText : colors.cardText },
                ]}
              >
                {orderType.name}
              </Text>
              {orderType.description ? (
                <Text
                  style={[
                    styles.cardDescription,
                    { color: isSelected ? colors.cardSelectedDesc : colors.cardDesc },
                  ]}
                  numberOfLines={2}
                >
                  {orderType.description}
                </Text>
              ) : null}
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  grid: { flexDirection: 'row', gap: 12 },
  card: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 6,
  },
  cardName: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  cardDescription: { fontSize: 11, textAlign: 'center' },
})

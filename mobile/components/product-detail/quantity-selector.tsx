import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/theme/provider'
import { Ionicons } from '@expo/vector-icons'
import type { ProductDetailColors } from '@/lib/product-detail-theme'

interface QuantitySelectorProps {
  quantity: number
  onIncrement: () => void
  onDecrement: () => void
  min?: number
  max?: number
  pdColors?: ProductDetailColors
}

export function QuantitySelector({
  quantity,
  onIncrement,
  onDecrement,
  min = 1,
  max = 99,
  pdColors,
}: QuantitySelectorProps) {
  const { theme } = useTheme()

  const containerBg = pdColors?.quantityControlsBackground ?? theme.buttonPrimary
  const btnColor = pdColors?.quantityButton ?? theme.buttonPrimaryText
  const textColor = pdColors?.quantityText ?? theme.buttonPrimaryText

  const handleDecrement = () => {
    if (quantity > min) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      onDecrement()
    }
  }

  const handleIncrement = () => {
    if (quantity < max) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      onIncrement()
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: containerBg }]}>
      <TouchableOpacity
        style={[styles.button, quantity <= min && styles.buttonDisabled]}
        onPress={handleDecrement}
        disabled={quantity <= min}
      >
        <Ionicons name="remove" size={20} color={btnColor} />
      </TouchableOpacity>
      <Text style={[styles.quantity, { color: textColor }]}>{quantity}</Text>
      <TouchableOpacity
        style={[styles.button, quantity >= max && styles.buttonDisabled]}
        onPress={handleIncrement}
        disabled={quantity >= max}
      >
        <Ionicons name="add" size={20} color={btnColor} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 4,
  },
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  quantity: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'center',
  },
})

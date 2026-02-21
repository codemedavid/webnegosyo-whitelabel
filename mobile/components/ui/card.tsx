import React from 'react'
import { View, StyleSheet, type ViewStyle } from 'react-native'
import { useTheme } from '@/theme/provider'

interface CardProps {
  children: React.ReactNode
  style?: ViewStyle
  variant?: 'default' | 'outlined' | 'elevated'
}

export function Card({ children, style, variant = 'default' }: CardProps) {
  const { theme } = useTheme()

  const variantStyles: Record<string, ViewStyle> = {
    default: {
      backgroundColor: theme.cards,
      borderWidth: 1,
      borderColor: theme.cardsBorder,
    },
    outlined: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.border,
    },
    elevated: {
      backgroundColor: theme.cards,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
  }

  return (
    <View style={[styles.card, variantStyles[variant], style]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
})

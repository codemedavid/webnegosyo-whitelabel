import React from 'react'
import { View, Text, StyleSheet, type ViewStyle } from 'react-native'
import { useTheme } from '@/theme/provider'

interface BadgeProps {
  text: string
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'sale'
  style?: ViewStyle
}

export function Badge({ text, variant = 'primary', style }: BadgeProps) {
  const { theme } = useTheme()

  const variantStyles: Record<string, { bg: string; text: string }> = {
    primary: { bg: theme.buttonPrimary, text: theme.buttonPrimaryText },
    success: { bg: theme.success, text: '#ffffff' },
    warning: { bg: theme.warning, text: '#ffffff' },
    error: { bg: theme.error, text: '#ffffff' },
    sale: { bg: '#ef4444', text: '#ffffff' },
  }

  const colors = variantStyles[variant]

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.text, { color: colors.text }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
})

import React from 'react'
import { Text, type TextProps, StyleSheet } from 'react-native'
import { useTheme } from '@/theme/provider'

interface ThemedTextProps extends TextProps {
  variant?: 'primary' | 'secondary' | 'muted' | 'header' | 'price' | 'cardTitle' | 'cardDescription' | 'link' | 'error'
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl'
  weight?: 'normal' | 'medium' | 'semibold' | 'bold'
}

export function ThemedText({
  variant = 'primary',
  size = 'base',
  weight = 'normal',
  style,
  ...props
}: ThemedTextProps) {
  const { theme } = useTheme()

  const colorMap: Record<string, string> = {
    primary: theme.textPrimary,
    secondary: theme.textSecondary,
    muted: theme.textMuted,
    header: theme.headerFont,
    price: theme.cardPrice,
    cardTitle: theme.cardTitle,
    cardDescription: theme.cardDescription,
    link: theme.link,
    error: theme.error,
  }

  const sizeMap: Record<string, number> = {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  }

  const weightMap: Record<string, '400' | '500' | '600' | '700'> = {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  }

  return (
    <Text
      style={[
        { color: colorMap[variant], fontSize: sizeMap[size], fontWeight: weightMap[weight] },
        style,
      ]}
      {...props}
    />
  )
}

export const textStyles = StyleSheet.create({
  center: { textAlign: 'center' },
  lineThrough: { textDecorationLine: 'line-through' },
})

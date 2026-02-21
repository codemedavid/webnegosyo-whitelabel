import React from 'react'
import { View, type ViewProps } from 'react-native'
import { useTheme } from '@/theme/provider'

interface ThemedViewProps extends ViewProps {
  variant?: 'background' | 'card' | 'header'
}

export function ThemedView({ variant = 'background', style, ...props }: ThemedViewProps) {
  const { theme } = useTheme()

  const variantStyles: Record<string, { backgroundColor: string }> = {
    background: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cards },
    header: { backgroundColor: theme.header },
  }

  return <View style={[variantStyles[variant], style]} {...props} />
}

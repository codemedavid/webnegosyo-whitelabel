import React from 'react'
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/theme/provider'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  disabled?: boolean
  style?: ViewStyle
  textStyle?: TextStyle
  fullWidth?: boolean
  checkoutVariant?: boolean
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = false,
  checkoutVariant = false,
}: ButtonProps) {
  const { theme } = useTheme()

  const handlePress = () => {
    if (disabled || isLoading) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onPress()
  }

  const getContainerStyle = (): ViewStyle => {
    const base: ViewStyle = {
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      ...(fullWidth ? { width: '100%' } : {}),
    }

    const sizeStyles: Record<string, ViewStyle> = {
      sm: { paddingVertical: 8, paddingHorizontal: 16 },
      md: { paddingVertical: 12, paddingHorizontal: 20 },
      lg: { paddingVertical: 16, paddingHorizontal: 24 },
    }

    const variantStyles: Record<string, ViewStyle> = {
      primary: { backgroundColor: checkoutVariant ? theme.checkoutModalButton : theme.buttonPrimary },
      secondary: { backgroundColor: theme.buttonSecondary },
      outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: checkoutVariant ? theme.checkoutModalButton : theme.buttonPrimary },
      ghost: { backgroundColor: 'transparent' },
    }

    return {
      ...base,
      ...sizeStyles[size],
      ...variantStyles[variant],
      opacity: disabled ? 0.5 : 1,
    }
  }

  const getTextStyle = (): TextStyle => {
    const sizeStyles: Record<string, TextStyle> = {
      sm: { fontSize: 13 },
      md: { fontSize: 15 },
      lg: { fontSize: 17 },
    }

    const variantStyles: Record<string, TextStyle> = {
      primary: { color: checkoutVariant ? theme.checkoutModalButtonText : theme.buttonPrimaryText },
      secondary: { color: theme.buttonSecondaryText },
      outline: { color: checkoutVariant ? theme.checkoutModalButton : theme.buttonPrimary },
      ghost: { color: theme.textPrimary },
    }

    return {
      fontWeight: '600',
      ...sizeStyles[size],
      ...variantStyles[variant],
    }
  }

  return (
    <TouchableOpacity
      style={[getContainerStyle(), style]}
      onPress={handlePress}
      disabled={disabled || isLoading}
      activeOpacity={0.7}
    >
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? (checkoutVariant ? theme.checkoutModalButtonText : theme.buttonPrimaryText) : (checkoutVariant ? theme.checkoutModalButton : theme.buttonPrimary)}
          style={styles.loader}
        />
      ) : null}
      <Text style={[getTextStyle(), textStyle]}>{title}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  loader: { marginRight: 8 },
})

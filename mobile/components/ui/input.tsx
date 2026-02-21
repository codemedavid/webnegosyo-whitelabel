import React, { useState } from 'react'
import { View, TextInput, Text, StyleSheet, type TextInputProps, type ViewStyle } from 'react-native'
import { useTheme } from '@/theme/provider'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
  containerStyle?: ViewStyle
  required?: boolean
  useCheckoutTheme?: boolean
}

export function Input({ label, error, containerStyle, required, style, useCheckoutTheme, ...props }: InputProps) {
  const { theme } = useTheme()
  const [isFocused, setIsFocused] = useState(false)

  const colors = useCheckoutTheme ? {
    label: theme.checkoutModalTitle,
    inputBg: theme.checkoutModalBackground,
    inputText: theme.checkoutModalTitle,
    inputBorder: theme.checkoutModalBorder,
    inputFocusBorder: theme.checkoutModalButton,
    placeholder: theme.checkoutModalDescription,
  } : {
    label: theme.textPrimary,
    inputBg: theme.cards,
    inputText: theme.textPrimary,
    inputBorder: theme.border,
    inputFocusBorder: theme.buttonPrimary,
    placeholder: theme.textMuted,
  }

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={[styles.label, { color: colors.label }]}>
          {label}
          {required ? <Text style={{ color: theme.error }}> *</Text> : null}
        </Text>
      ) : null}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBg,
            borderColor: error ? theme.error : isFocused ? colors.inputFocusBorder : colors.inputBorder,
            color: colors.inputText,
          },
          style,
        ]}
        placeholderTextColor={colors.placeholder}
        onFocus={(e) => {
          setIsFocused(true)
          props.onFocus?.(e)
        }}
        onBlur={(e) => {
          setIsFocused(false)
          props.onBlur?.(e)
        }}
        {...props}
      />
      {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: { fontSize: 12, marginTop: 4 },
})

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Input } from '@/components/ui/input'
import { useTheme } from '@/theme/provider'
import type { CustomerFormField } from '@/types/database'

interface DynamicFormProps {
  fields: CustomerFormField[]
  values: Record<string, string>
  errors: Record<string, string>
  onChangeValue: (fieldName: string, value: string) => void
  checkoutTheme?: boolean
}

export function DynamicForm({ fields, values, errors, onChangeValue, checkoutTheme }: DynamicFormProps) {
  const { theme } = useTheme()

  const getKeyboardType = (fieldType: string) => {
    switch (fieldType) {
      case 'email': return 'email-address' as const
      case 'phone': return 'phone-pad' as const
      case 'number': return 'numeric' as const
      default: return 'default' as const
    }
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: checkoutTheme ? theme.checkoutModalTitle : theme.textPrimary }]}>Your Information</Text>
      {fields.map((field) => (
        <Input
          key={field.id}
          label={field.field_label}
          required={field.is_required}
          value={values[field.field_name] || ''}
          onChangeText={(text) => onChangeValue(field.field_name, text)}
          placeholder={field.placeholder || ''}
          keyboardType={getKeyboardType(field.field_type)}
          multiline={field.field_type === 'textarea'}
          numberOfLines={field.field_type === 'textarea' ? 3 : 1}
          error={errors[field.field_name]}
          autoCapitalize={field.field_type === 'email' ? 'none' : 'sentences'}
          textAlignVertical={field.field_type === 'textarea' ? 'top' : 'center'}
          style={field.field_type === 'textarea' ? styles.textarea : undefined}
          useCheckoutTheme={checkoutTheme}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  textarea: { height: 80, paddingTop: 12 },
})

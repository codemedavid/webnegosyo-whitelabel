import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/provider'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { PaymentMethod } from '@/types/database'

interface PaymentMethodCardProps {
  method: PaymentMethod
  isSelected: boolean
  onSelect: () => void
  checkoutTheme?: boolean
}

export function PaymentMethodCard({ method, isSelected, onSelect, checkoutTheme }: PaymentMethodCardProps) {
  const { theme } = useTheme()

  const colors = checkoutTheme ? {
    cardBg: theme.checkoutModalBackground,
    cardBorder: theme.checkoutModalBorder,
    selectedBg: theme.checkoutModalButton,
    selectedBorder: theme.checkoutModalButton,
    selectedText: theme.checkoutModalButtonText,
    text: theme.checkoutModalTitle,
    desc: theme.checkoutModalDescription,
  } : {
    cardBg: theme.cards,
    cardBorder: theme.border,
    selectedBg: theme.buttonPrimary,
    selectedBorder: theme.buttonPrimary,
    selectedText: theme.buttonPrimaryText,
    text: theme.textPrimary,
    desc: theme.textSecondary,
  }

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isSelected ? colors.selectedBg : colors.cardBg,
          borderColor: isSelected ? colors.selectedBorder : colors.cardBorder,
        },
      ]}
      onPress={onSelect}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.radio,
            {
              borderColor: isSelected ? colors.selectedText : colors.cardBorder,
            },
          ]}
        >
          {isSelected ? (
            <View
              style={[styles.radioInner, { backgroundColor: colors.selectedText }]}
            />
          ) : null}
        </View>
        <View style={styles.info}>
          <Text
            style={[
              styles.name,
              { color: isSelected ? colors.selectedText : colors.text },
            ]}
          >
            {method.name}
          </Text>
          {method.details ? (
            <Text
              style={[
                styles.details,
                { color: isSelected ? colors.selectedText : colors.desc },
              ]}
              numberOfLines={2}
            >
              {method.details}
            </Text>
          ) : null}
          {method.require_payment_proof ? (
            <View style={styles.proofBadge}>
              <Ionicons
                name="receipt-outline"
                size={11}
                color={isSelected ? colors.selectedText : colors.desc}
              />
              <Text
                style={[
                  styles.proofBadgeText,
                  { color: isSelected ? colors.selectedText : colors.desc },
                ]}
              >
                Payment proof required
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {isSelected && method.qr_code_url ? (
        <View style={styles.qrContainer}>
          <OptimizedImage
            source={method.qr_code_url}
            style={styles.qrImage}
            contentFit="contain"
          />
          <Text style={[styles.qrHint, { color: colors.selectedText }]}>
            Scan QR code to pay
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  details: { fontSize: 13, marginTop: 2 },
  proofBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  proofBadgeText: { fontSize: 11, fontWeight: '600' },
  qrContainer: {
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  qrHint: { fontSize: 13, marginTop: 8 },
})

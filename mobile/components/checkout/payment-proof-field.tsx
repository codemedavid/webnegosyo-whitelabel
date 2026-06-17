import React from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/provider'
import { OptimizedImage } from '@/components/shared/optimized-image'

interface PaymentProofFieldProps {
  required: boolean
  screenshotUrl: string
  reference: string
  isUploading: boolean
  onPickImage: () => void
  onRemoveImage: () => void
  onReferenceChange: (value: string) => void
}

/**
 * Payment proof entry for mobile checkout — screenshot upload (Cloudinary) and/or
 * reference number. When the selected method requires proof, the customer must
 * provide at least one; enforced in checkout before the order is placed.
 */
export function PaymentProofField({
  required,
  screenshotUrl,
  reference,
  isUploading,
  onPickImage,
  onRemoveImage,
  onReferenceChange,
}: PaymentProofFieldProps) {
  const { theme } = useTheme()

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.checkoutModalBackground, borderColor: theme.checkoutModalBorder },
      ]}
    >
      <View style={styles.header}>
        <Ionicons name="receipt-outline" size={16} color={theme.checkoutModalTitle} />
        <Text style={[styles.title, { color: theme.checkoutModalTitle }]}>
          Payment Proof{required ? ' *' : ' (optional)'}
        </Text>
      </View>

      <Text style={[styles.subtitle, { color: theme.checkoutModalDescription }]}>
        {required
          ? 'Upload a screenshot of your payment or enter your reference number to continue.'
          : 'Optionally upload a screenshot or enter your payment reference number.'}
      </Text>

      {screenshotUrl ? (
        <View style={styles.previewWrap}>
          <OptimizedImage source={screenshotUrl} style={styles.preview} contentFit="cover" />
          <TouchableOpacity style={styles.removeBtn} onPress={onRemoveImage}>
            <Ionicons name="close" size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.uploadBtn, { borderColor: theme.checkoutModalButton }]}
          onPress={onPickImage}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color={theme.checkoutModalButton} />
          ) : (
            <Ionicons name="cloud-upload-outline" size={18} color={theme.checkoutModalButton} />
          )}
          <Text style={[styles.uploadText, { color: theme.checkoutModalButton }]}>
            {isUploading ? 'Uploading...' : 'Upload Screenshot'}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.label, { color: theme.checkoutModalDescription }]}>
        Reference / Transaction Number
      </Text>
      <TextInput
        value={reference}
        onChangeText={onReferenceChange}
        placeholder="e.g. 0091234567890"
        placeholderTextColor={theme.checkoutModalDescription}
        maxLength={120}
        style={[
          styles.input,
          { borderColor: theme.checkoutModalBorder, color: theme.checkoutModalTitle },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, borderWidth: 1.5, padding: 14, marginBottom: 10, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 13 },
  previewWrap: { alignSelf: 'flex-start', marginTop: 4 },
  preview: { width: 140, height: 140, borderRadius: 8, backgroundColor: '#ffffff' },
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
  },
  uploadText: { fontSize: 14, fontWeight: '600' },
  label: { fontSize: 13, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
})

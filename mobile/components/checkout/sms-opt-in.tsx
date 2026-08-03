import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

/**
 * Permission to text this customer later.
 *
 * Unticked by default and never pre-checked: a pre-ticked box is not consent,
 * and this is the record the merchant would rely on if a recipient ever
 * complained. The value is a boolean all the way to the order — see
 * `lib/sms-consent` for why it must not travel as a form field.
 */
interface SmsOptInProps {
  isOptedIn: boolean
  onChange: (isOptedIn: boolean) => void
  storeName: string
  accentColor: string
  textColor: string
  borderColor: string
}

export function SmsOptIn({
  isOptedIn,
  onChange,
  storeName,
  accentColor,
  textColor,
  borderColor,
}: SmsOptInProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onChange(!isOptedIn)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isOptedIn }}
      accessibilityLabel={`Text me updates and offers from ${storeName}`}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.box,
          { borderColor: isOptedIn ? accentColor : borderColor },
          isOptedIn && { backgroundColor: accentColor },
        ]}
      >
        {isOptedIn && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={[styles.label, { color: textColor }]}>
        Text me updates and offers from {storeName}. Standard message rates apply, and you can opt
        out any time.
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  label: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
})

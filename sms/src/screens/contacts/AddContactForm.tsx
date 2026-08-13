import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { normalizePhoneNumber } from '../../domain/phoneNumber';
import { colors, fontSize, radius, spacing } from '../../ui/theme';

export interface AddContactFormProps {
  onSubmit: (name: string, phone: string, consentGiven: boolean) => void;
}

const INVALID_PHONE_MESSAGE = 'Enter a valid phone number, e.g. +15555550100.';

export function AddContactForm({ onSubmit }: AddContactFormProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consentGiven, setConsentGiven] = useState(true);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  function handleSubmit(): void {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      return;
    }

    const normalizedPhone = normalizePhoneNumber(trimmedPhone);
    if (!normalizedPhone) {
      setPhoneError(INVALID_PHONE_MESSAGE);
      return;
    }

    setPhoneError(null);
    onSubmit(trimmedName, normalizedPhone, consentGiven);
    setName('');
    setPhone('');
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Add Contact</Text>
      <TextInput
        accessibilityLabel="Contact name"
        placeholder="Name"
        placeholderTextColor={colors.textSecondary}
        value={name}
        onChangeText={setName}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Contact phone number"
        placeholder="Phone number"
        placeholderTextColor={colors.textSecondary}
        value={phone}
        onChangeText={(value) => {
          setPhone(value);
          setPhoneError(null);
        }}
        keyboardType="phone-pad"
        style={styles.input}
      />
      {phoneError && <Text style={styles.errorText}>{phoneError}</Text>}
      <View style={styles.consentRow}>
        <Text style={styles.consentLabel}>Consent given</Text>
        <Switch
          accessibilityLabel="Consent given"
          value={consentGiven}
          onValueChange={setConsentGiven}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      <Pressable
        onPress={handleSubmit}
        accessibilityRole="button"
        style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
      >
        <Text style={styles.submitButtonText}>Add Contact</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    marginTop: -spacing.xs,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  consentLabel: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitButtonText: {
    color: colors.onPrimary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});

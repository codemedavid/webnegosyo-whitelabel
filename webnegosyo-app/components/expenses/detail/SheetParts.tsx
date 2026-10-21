import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { colors, radius, spacing, typography } from "../../../theme/colors";
import { sheetText } from "../../drawer/DrawerSheet";
import { Icon } from "../../Icon";

interface ChoicePillProps {
  label: string;
  isOn: boolean;
  onPress: () => void;
  testID?: string;
}

/** A pill to pick one of a few: ink when chosen. */
export function ChoicePill({ label, isOn, onPress, testID }: ChoicePillProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.pill, isOn && styles.pillOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: isOn }}
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={[styles.pillText, isOn && styles.pillTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PillRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.pills}>{children}</View>;
}

/** The row at the top of an in-place step that goes back one step. */
export function BackRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.back} accessibilityRole="button" accessibilityLabel={label} testID="sheet-back">
      <Icon name="chevron-left" size={18} color={colors.textPrimary} />
      <Text style={styles.backText}>{label}</Text>
    </TouchableOpacity>
  );
}

interface TextFieldProps {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  maxLength: number;
  accessibilityLabel: string;
}

export function TextField({ value, onChange, placeholder, maxLength, accessibilityLabel }: TextFieldProps) {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      maxLength={maxLength}
      returnKeyType="done"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

interface ReasonFieldProps {
  reasons: readonly string[];
  value: string;
  onChange: (text: string) => void;
  maxLength: number;
  label?: string;
}

/** Reason chips plus "or type it" — a reason is always required. */
export function ReasonField({ reasons, value, onChange, maxLength, label = "Why" }: ReasonFieldProps) {
  return (
    <>
      <Text style={sheetText.label}>{label}</Text>
      <PillRow>
        {reasons.map((reason) => (
          <ChoicePill key={reason} label={reason} isOn={value === reason} onPress={() => onChange(reason)} />
        ))}
      </PillRow>
      <TextField value={value} onChange={onChange} placeholder="Or type the reason" maxLength={maxLength} accessibilityLabel="Reason" />
    </>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  pillTextOn: { color: colors.textOnDark },
  back: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44, alignSelf: "flex-start" },
  backText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    backgroundColor: colors.background,
  },
});

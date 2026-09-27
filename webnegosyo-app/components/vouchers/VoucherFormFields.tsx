import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Icon, type IconName } from "../Icon";

/**
 * The voucher editor's building blocks: a titled section, a labelled text
 * box with an optional ₱ or % on either side, and the three big deal-type
 * tiles. Kept here so the editor screen reads as the order of decisions a
 * merchant makes, not as three hundred lines of styling.
 */

export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

interface LabeledInputProps extends Pick<TextInputProps, "autoCapitalize" | "maxLength" | "autoCorrect"> {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  keyboardType?: KeyboardTypeOptions;
  error?: string | null;
  warning?: string | null;
  /** Monospaced and spaced out, for the code itself. */
  isCode?: boolean;
  /** A small action at the right end of the box, e.g. "Suggest". */
  action?: { label: string; icon: IconName; onPress: () => void };
  isFirst?: boolean;
  testID?: string;
}

export function LabeledInput({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  prefix,
  suffix,
  keyboardType,
  error,
  warning,
  isCode,
  action,
  isFirst,
  autoCapitalize,
  maxLength,
  autoCorrect,
  testID,
}: LabeledInputProps) {
  return (
    <View style={[styles.field, isFirst && styles.fieldFirst]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputBox, error ? styles.inputBoxError : null]}>
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.input, isCode && styles.inputCode]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          maxLength={maxLength}
          accessibilityLabel={label}
          accessibilityHint={hint}
          testID={testID}
        />
        {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
        {action ? (
          <TouchableOpacity
            style={styles.inputAction}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Icon name={action.icon} size={15} color={colors.textPrimary} />
            <Text style={styles.inputActionText}>{action.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : warning ? (
        <View style={styles.warningRow}>
          <Icon name="warning" size={14} color={colors.statusPending.text} />
          <Text style={styles.warning}>{warning}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export interface TileOption<T extends string> {
  value: T;
  label: string;
  hint: string;
}

/** Big, thumb-sized choices for the one decision every voucher starts with. */
export function ChoiceTiles<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly TileOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.tiles}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.tile, isActive && styles.tileActive]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${option.label}. ${option.hint}`}
          >
            <Text style={[styles.tileLabel, isActive && styles.tileLabelActive]}>{option.label}</Text>
            <Text style={[styles.tileHint, isActive && styles.tileHintActive]} numberOfLines={2}>
              {option.hint}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** One-tap values under an amount box. */
export function QuickChips({
  values,
  format,
  selected,
  onPick,
}: {
  values: readonly number[];
  format: (value: number) => string;
  selected: number | null;
  onPick: (value: number) => void;
}) {
  return (
    <View style={styles.quick}>
      {values.map((value) => {
        const isActive = selected === value;
        return (
          <TouchableOpacity
            key={value}
            style={[styles.quickChip, isActive && styles.quickChipActive]}
            onPress={() => onPick(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.quickText, isActive && styles.quickTextActive]}>{format(value)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function InfoNote({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <Icon name="info" size={16} color={colors.info} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xxl },
  sectionTitle: { ...typography.heading, color: colors.textPrimary },
  sectionHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  card: {
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },

  field: { marginTop: spacing.lg },
  fieldFirst: { marginTop: 0 },
  label: { ...typography.body, color: colors.textPrimary, fontWeight: "600", marginBottom: spacing.sm },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surfaceSubtle,
  },
  inputBoxError: { borderColor: colors.danger, backgroundColor: colors.dangerLight },
  input: { flex: 1, fontSize: 16, color: colors.textPrimary, paddingVertical: spacing.md },
  inputCode: { fontWeight: "700", letterSpacing: 1.5, fontSize: 17 },
  affix: { fontSize: 16, fontWeight: "700", color: colors.textSecondary, marginHorizontal: 2 },
  inputAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  inputActionText: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, fontWeight: "600" },
  warningRow: { flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: spacing.xs },
  warning: { ...typography.caption, color: colors.statusPending.text, flex: 1 },

  tiles: { flexDirection: "row", gap: spacing.sm },
  tile: {
    flex: 1,
    minHeight: 84,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.separator,
    backgroundColor: colors.surfaceSubtle,
  },
  tileActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileLabel: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  tileLabelActive: { color: colors.textOnDark },
  tileHint: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xs },
  tileHintActive: { color: colors.heroInkMuted },

  quick: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  quickChip: {
    minWidth: 52,
    height: 36,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  quickChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  quickText: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
  quickTextActive: { color: colors.textOnDark },

  note: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoLight,
  },
  noteText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
});

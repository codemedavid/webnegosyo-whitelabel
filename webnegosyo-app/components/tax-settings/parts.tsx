/**
 * The building blocks of Settings → Tax & discounts: a card per topic, a few
 * tappable choice cards, a labelled text field, a switch row and a quiet note.
 * One shape for each so the five sections read as one form.
 */
import React from "react";
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, type TextInputProps } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Icon, type IconName } from "../Icon";

interface SettingsCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingsCard({ title, description, children }: SettingsCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        {title}
      </Text>
      {description ? <Text style={styles.cardDescription}>{description}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  title: string;
  hint?: string;
  /** A worked example under the hint. */
  detail?: string;
}

interface ChoiceCardsProps<T extends string> {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  isInvalid?: boolean;
}

/** One-of-N as tappable cards, each a radio for screen readers. */
export function ChoiceCards<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  isInvalid,
}: ChoiceCardsProps<T>) {
  return (
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.choice,
              isSelected && styles.choiceSelected,
              isInvalid && value === null && styles.choiceInvalid,
              disabled && styles.disabled,
            ]}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected, disabled: !!disabled }}
            accessibilityLabel={[option.title, option.hint, option.detail].filter(Boolean).join(". ")}
          >
            <View style={styles.choiceHead}>
              <Text style={styles.choiceTitle}>{option.title}</Text>
              <View style={[styles.radio, isSelected && styles.radioOn]}>
                {isSelected ? <Icon name="check" size={12} color={colors.textOnDark} /> : null}
              </View>
            </View>
            {option.hint ? <Text style={styles.choiceHint}>{option.hint}</Text> : null}
            {option.detail ? (
              <View style={styles.detailChip}>
                <Text style={styles.detailText}>{option.detail}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface TextFieldProps extends Omit<TextInputProps, "style" | "editable"> {
  label: string;
  hint?: string;
  error?: string;
  isOptional?: boolean;
  disabled?: boolean;
  isMono?: boolean;
  /** Drawn inside the field before the text, e.g. "₱". */
  prefix?: string;
}

export function TextField({ label, hint, error, isOptional, disabled, isMono, prefix, ...input }: TextFieldProps) {
  const fullLabel = isOptional ? `${label} (optional)` : label;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {isOptional ? <Text style={styles.optional}> · optional</Text> : null}
      </Text>
      <View style={[styles.inputWrap, !!error && styles.inputInvalid, disabled && styles.inputDisabled]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          {...input}
          editable={!disabled}
          style={[styles.input, isMono && styles.mono]}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={fullLabel}
          accessibilityHint={error ?? hint}
        />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

interface SwitchRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({ label, hint, value, onChange, disabled }: SwitchRowProps) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchCopy}>
        <Text style={styles.switchLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.separator, true: colors.success }}
        accessibilityLabel={label}
        accessibilityHint={hint}
      />
    </View>
  );
}

interface NoteProps {
  children: React.ReactNode;
  icon?: IconName;
  tone?: "info" | "warning";
}

export function Note({ children, icon = "info", tone = "info" }: NoteProps) {
  const isWarning = tone === "warning";
  return (
    <View style={[styles.note, isWarning && styles.noteWarning]}>
      <Icon name={icon} size={16} color={isWarning ? colors.statusPending.text : colors.textSecondary} />
      <Text style={[styles.noteText, isWarning && styles.noteTextWarning]}>{children}</Text>
    </View>
  );
}

/** A line of receipt paper: how something will print. */
export function PaperPreview({ label, lines }: { label: string; lines: { text: string; isBold?: boolean; isPlaceholder?: boolean }[] }) {
  return (
    <View style={styles.paperWrap} accessible accessibilityLabel={`${label}: ${lines.map((l) => l.text).join(", ")}`}>
      <Text style={styles.paperLabel}>{label}</Text>
      <View style={styles.paper}>
        {lines.map((line, index) => (
          <Text
            key={`${index}-${line.text}`}
            style={[styles.paperLine, line.isBold && styles.paperBold, line.isPlaceholder && styles.paperPlaceholder]}
          >
            {line.text}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  cardDescription: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  cardBody: { marginTop: spacing.md, gap: spacing.md },

  choices: { gap: spacing.sm },
  choice: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  choiceSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.surfaceSubtle },
  choiceInvalid: { borderColor: colors.danger },
  disabled: { opacity: 0.7 },
  choiceHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  choiceTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  choiceHint: { ...typography.caption, color: colors.textSecondary },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  detailChip: {
    alignSelf: "flex-start",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.xs,
  },
  detailText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary, fontVariant: ["tabular-nums"] },

  field: { gap: spacing.xs },
  fieldLabel: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  optional: { fontWeight: "400", color: colors.textSecondary },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  inputInvalid: { borderColor: colors.danger },
  inputDisabled: { backgroundColor: colors.surfaceSubtle },
  prefix: { ...typography.body, color: colors.textSecondary, marginRight: spacing.xs },
  input: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: spacing.sm },
  mono: { fontVariant: ["tabular-nums"], letterSpacing: 0.5 },
  fieldHint: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },

  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 },
  switchCopy: { flex: 1, gap: 2 },
  switchLabel: { ...typography.body, fontWeight: "600", color: colors.textPrimary },

  note: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  noteWarning: { backgroundColor: colors.statusPending.bg },
  noteText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  noteTextWarning: { color: colors.statusPending.text },

  paperWrap: { gap: spacing.xs },
  paperLabel: { ...typography.small, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.6 },
  paper: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.separator,
    padding: spacing.md,
    alignItems: "center",
    gap: 2,
  },
  paperLine: { ...typography.caption, color: colors.textPrimary, textAlign: "center", fontVariant: ["tabular-nums"] },
  paperBold: { fontWeight: "800" },
  paperPlaceholder: { color: colors.textTertiary, fontStyle: "italic" },
});

import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { formatRuleValue, parseRuleText, stepRule, type RuleField } from "../../lib/approvals/rules-form";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

interface RulesSentenceRowProps {
  field: RuleField;
  value: number;
  onChange: (value: number) => void;
}

/**
 * One rule as a sentence with its value inline (design-spec §3.10): preset
 * jumps on − / +, and tapping the value opens a keypad. A typed value
 * outside the server's bounds is refused in place, with the bounds.
 */
export function RulesSentenceRow({ field, value, onChange }: RulesSentenceRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = formatRuleValue(field, value);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseRuleText(field, draft);
    if (parsed === null) {
      setProblem(`Between ${formatRuleValue(field, field.min)} and ${formatRuleValue(field, field.max)}`);
      return;
    }
    setProblem(null);
    setDraft(null);
    onChange(parsed);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.sentence}>{field.prefix}</Text>
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.step}
          onPress={() => onChange(stepRule(field, value, -1))}
          disabled={value <= field.min}
          accessibilityRole="button"
          accessibilityLabel={`Lower ${field.label}`}
        >
          <Icon name="minus" size={18} color={value <= field.min ? colors.textTertiary : colors.textPrimary} />
        </TouchableOpacity>
        {draft === null ? (
          <TouchableOpacity
            style={styles.value}
            onPress={() => setDraft(String(value))}
            accessibilityRole="button"
            accessibilityLabel={`${field.label}: ${shown}. Tap to type`}
          >
            <Text style={styles.valueText}>{shown}</Text>
          </TouchableOpacity>
        ) : (
          <TextInput
            style={[styles.value, styles.input]}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commit}
            onBlur={commit}
            keyboardType={field.isWhole ? "number-pad" : "decimal-pad"}
            returnKeyType="done"
            autoFocus
            accessibilityLabel={field.label}
          />
        )}
        <TouchableOpacity
          style={styles.step}
          onPress={() => onChange(stepRule(field, value, 1))}
          disabled={value >= field.max}
          accessibilityRole="button"
          accessibilityLabel={`Raise ${field.label}`}
        >
          <Icon name="plus" size={18} color={value >= field.max ? colors.textTertiary : colors.textPrimary} />
        </TouchableOpacity>
      </View>
      <Text style={styles.sentence}>{field.suffix}</Text>
      {field.note ? <Text style={styles.note}>{field.note}</Text> : null}
      {problem ? (
        <Text style={styles.problem} accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.md },
  sentence: { ...typography.body, color: colors.textPrimary },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  step: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  value: {
    minWidth: 112,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  valueText: { ...typography.heading, color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  input: { ...typography.heading, color: colors.textPrimary, textAlign: "center", borderWidth: 1, borderColor: colors.primary },
  note: { ...typography.caption, fontStyle: "italic", color: colors.textMuted },
  problem: { ...typography.caption, color: colors.danger, fontWeight: "600" },
});

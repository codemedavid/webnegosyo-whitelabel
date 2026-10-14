import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Icon } from "../../Icon";
import { OptionPills } from "../../OptionPills";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import type { AutomationParams, RecipeInfo } from "../../../lib/sms-automations/api";
import { canStep, knobValue, minOrderOptions, stepKnob, type EditorDraft } from "../../../lib/sms-automations/editor";
import { sentenceFor, unitFor } from "../../../lib/sms-automations/view";

interface KnobSentenceProps {
  info: RecipeInfo;
  draft: EditorDraft;
  onChange: (params: AutomationParams) => void;
}

/** "Text guests who haven’t ordered in (− 30 +) days" — the automation as a sentence the owner completes. */
export function KnobSentence({ info, draft, onChange }: KnobSentenceProps) {
  const sentence = sentenceFor(info.id);
  const limits = info.limits[sentence.knob];
  const value = knobValue(draft, sentence.knob, info);
  const unit = unitFor(value, sentence.unit);
  const orderOptions = minOrderOptions(info, draft.params.minOrderCount);
  const set = (next: number) => onChange({ ...draft.params, [sentence.knob]: next });

  return (
    <View style={styles.card}>
      <Text style={styles.sentence}>{sentence.before}</Text>
      <View style={styles.stepperRow}>
        <StepButton
          icon="minus"
          label={`Fewer ${sentence.unit}`}
          isEnabled={canStep(value, -1, limits)}
          onPress={() => set(stepKnob(value, -1, sentence.knob, limits))}
        />
        <View
          style={styles.valueBox}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${value} ${unit}`}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => {
            const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
            if (canStep(value, direction, limits)) set(stepKnob(value, direction, sentence.knob, limits));
          }}
        >
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
        <StepButton
          icon="plus"
          label={`More ${sentence.unit}`}
          isEnabled={canStep(value, 1, limits)}
          onPress={() => set(stepKnob(value, 1, sentence.knob, limits))}
        />
      </View>
      {sentence.after ? <Text style={styles.sentence}>{sentence.after}</Text> : null}
      {orderOptions.length > 0 ? (
        <View style={styles.who}>
          <Text style={styles.whoLabel}>Who gets it</Text>
          <OptionPills
            options={orderOptions}
            isSelected={(count) => count === (draft.params.minOrderCount ?? info.defaults.minOrderCount)}
            onSelect={(minOrderCount) => onChange({ ...draft.params, minOrderCount })}
            accessibilityPrefix="Send to"
          />
        </View>
      ) : null}
    </View>
  );
}

interface StepButtonProps {
  icon: "minus" | "plus";
  label: string;
  isEnabled: boolean;
  onPress: () => void;
}

function StepButton({ icon, label, isEnabled, onPress }: StepButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.step, !isEnabled && styles.stepOff]}
      onPress={onPress}
      disabled={!isEnabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !isEnabled }}
      hitSlop={6}
    >
      <Icon name={icon} size={20} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  sentence: { fontSize: 18, fontWeight: "600", color: colors.textPrimary, lineHeight: 25 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  step: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  stepOff: { opacity: 0.35 },
  valueBox: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs, minWidth: 96, justifyContent: "center" },
  value: { fontSize: 30, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  unit: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  who: { gap: spacing.sm, marginTop: spacing.xs },
  whoLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
});

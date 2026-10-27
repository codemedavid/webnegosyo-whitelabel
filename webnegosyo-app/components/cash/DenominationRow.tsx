import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { lineCents, type Denomination } from "../../lib/cash/denominations";
import { formatCents, spokenCents } from "../../lib/expenses/expense-format";
import { colors, radius, spacing } from "../../theme/colors";
import { Icon } from "../Icon";
import { DenominationChip } from "./DenominationChip";
import { useHoldRepeat } from "./use-hold-repeat";

/** Stepper size: 48pt on a phone, 56 on a tablet (06 §9). */
export const STEPPER_SIZE = 48;
export const TABLET_STEPPER_SIZE = 56;

interface DenominationRowProps {
  denomination: Denomination;
  count: number;
  isFocused: boolean;
  isTablet: boolean;
  isDisabled?: boolean;
  onStep: (delta: 1 | -1) => void;
  onFocus: () => void;
}

interface StepperProps {
  delta: 1 | -1;
  denomination: Denomination;
  size: number;
  isDisabled: boolean;
  onStep: (delta: 1 | -1) => void;
}

function stepperLabel(delta: 1 | -1, denomination: Denomination): string {
  const noun = `${denomination.label} ${denomination.kind}`;
  return delta === 1 ? `Add one ${noun}` : `Remove one ${noun}`;
}

function Stepper({ delta, denomination, size, isDisabled, onStep }: StepperProps) {
  const hold = useHoldRepeat(() => onStep(delta), isDisabled);
  return (
    <Pressable
      onPressIn={hold.onPressIn}
      onPressOut={hold.onPressOut}
      disabled={isDisabled}
      style={({ pressed }) => [styles.stepper, { width: size, height: size }, pressed && styles.stepperPressed, isDisabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={stepperLabel(delta, denomination)}
      accessibilityState={{ disabled: isDisabled }}
      testID={`denomination-${denomination.key}-${delta === 1 ? "plus" : "minus"}`}
    >
      <Icon name={delta === 1 ? "plus" : "minus"} size={20} color={colors.textPrimary} />
    </Pressable>
  );
}

/**
 * One denomination: chip · − · count · + · subtotal. Tapping the count points
 * the keypad at this row (coral border + wash); the steppers repeat when held.
 * A screen reader hears "₱100 bills, 7, 700 pesos".
 */
export function DenominationRow({ denomination, count, isFocused, isTablet, isDisabled = false, onStep, onFocus }: DenominationRowProps) {
  const subtotal = lineCents(denomination.key, count);
  const size = isTablet ? TABLET_STEPPER_SIZE : STEPPER_SIZE;
  const isEmpty = count === 0;
  return (
    <View style={[styles.row, isFocused && styles.rowFocused]} testID={`denomination-${denomination.key}`}>
      <DenominationChip denomination={denomination} />
      <Stepper delta={-1} denomination={denomination} size={size} isDisabled={isDisabled || isEmpty} onStep={onStep} />
      <Pressable
        onPress={onFocus}
        disabled={isDisabled}
        style={styles.countHit}
        accessibilityRole="button"
        accessibilityLabel={`${denomination.pluralLabel}, ${count}, ${spokenCents(subtotal)}`}
        accessibilityHint="Type the count on the keypad"
        accessibilityState={{ selected: isFocused, disabled: isDisabled }}
        testID={`denomination-${denomination.key}-count`}
      >
        <Text style={[styles.count, isEmpty && styles.muted]}>{count}</Text>
      </Pressable>
      <Stepper delta={1} denomination={denomination} size={size} isDisabled={isDisabled} onStep={onStep} />
      <Text style={[styles.subtotal, isEmpty && styles.subtotalEmpty]} numberOfLines={1} adjustsFontSizeToFit>
        {formatCents(subtotal, { compact: true })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  rowFocused: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  stepper: {
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperPressed: { backgroundColor: colors.separator },
  disabled: { opacity: 0.4 },
  countHit: { minWidth: 52, minHeight: 48, alignItems: "center", justifyContent: "center" },
  count: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  muted: { color: colors.textTertiary },
  subtotal: { flex: 1, textAlign: "right", fontSize: 14, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  subtotalEmpty: { color: colors.textTertiary, fontWeight: "600" },
});

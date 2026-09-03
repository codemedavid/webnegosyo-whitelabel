import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing } from "../../theme/colors";

export type StepperStatus = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";

const STATUS_STEPS: StepperStatus[] = ["pending", "confirmed", "preparing", "ready", "delivered"];

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Where an order is on its way from placed to handed over.
 *
 * Five dots on a line; the ones behind the order are green, the current one is
 * ink and a touch larger. A cancelled order turns every dot red rather than
 * pretending to be somewhere on the path.
 */
export function StatusStepper({ currentStatus }: { currentStatus: StepperStatus }) {
  const currentIndex = STATUS_STEPS.indexOf(currentStatus);
  const isCancelled = currentStatus === "cancelled";

  return (
    <View
      style={styles.container}
      accessibilityLabel={isCancelled ? "Order cancelled" : `Order status: ${capitalize(currentStatus)}`}
    >
      {STATUS_STEPS.map((step, i) => {
        const isComplete = !isCancelled && i <= currentIndex;
        const isCurrent = !isCancelled && i === currentIndex;
        return (
          <View key={step} style={styles.step}>
            <View
              style={[
                styles.dot,
                isComplete && styles.dotComplete,
                isCurrent && styles.dotCurrent,
                isCancelled && styles.dotCancelled,
              ]}
            />
            <Text style={[styles.label, isComplete && styles.labelComplete, isCurrent && styles.labelCurrent]}>
              {capitalize(step)}
            </Text>
            {i < STATUS_STEPS.length - 1 && (
              <View style={[styles.line, isComplete && i < currentIndex && styles.lineComplete]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm },
  step: { alignItems: "center", flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.separator },
  dotComplete: { backgroundColor: colors.success },
  dotCurrent: { backgroundColor: colors.primary, width: 14, height: 14, borderRadius: 7 },
  dotCancelled: { backgroundColor: colors.danger },
  label: { ...typography.small, color: colors.textTertiary, marginTop: spacing.xs },
  labelComplete: { color: colors.textSecondary, fontWeight: "500" },
  labelCurrent: { color: colors.textPrimary, fontWeight: "700" },
  line: { position: "absolute", top: 5, left: "60%", right: "-40%", height: 2, backgroundColor: colors.separator },
  lineComplete: { backgroundColor: colors.success },
});

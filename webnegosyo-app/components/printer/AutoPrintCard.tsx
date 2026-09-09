import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, typography, spacing } from "../../theme/colors";
import { Card } from "../Card";
import { SegmentedControl } from "../SegmentedControl";
import type { PrintTrigger } from "../../lib/print-trigger";

/** The four print moments as short segments, in the order a merchant reasons about them. */
const TRIGGER_OPTIONS: { label: string; value: PrintTrigger }[] = [
  { label: "On confirm", value: "confirmation" },
  { label: "On bill out", value: "billout" },
  { label: "Both", value: "both" },
  { label: "Off", value: "off" },
];

const TRIGGER_HINTS: Record<PrintTrigger, string> = {
  confirmation: "Prints when you accept an order, and after every counter sale.",
  billout: "Prints when payment is settled, and after every counter sale.",
  both: "Prints on confirm and again on payment.",
  off: "Only prints when you tap Reprint Receipt.",
};

interface AutoPrintCardProps {
  printTrigger: PrintTrigger;
  kitchenAutoPrint: boolean;
  hasCashierPrinter: boolean;
  hasKitchenPrinter: boolean;
  onPrintTrigger: (trigger: PrintTrigger) => void;
  onKitchenAutoPrint: (enabled: boolean) => void;
}

/**
 * When paper comes out on its own. Two decisions, one card: the customer
 * receipt (a moment) and the kitchen ticket (on or off). The receipt choice
 * used to be four stacked radio rows with a hint under each; a segmented
 * control with one hint for the current choice says the same in a quarter of
 * the height.
 */
export function AutoPrintCard({
  printTrigger,
  kitchenAutoPrint,
  hasCashierPrinter,
  hasKitchenPrinter,
  onPrintTrigger,
  onKitchenAutoPrint,
}: AutoPrintCardProps) {
  const isAnythingAutomatic =
    (hasCashierPrinter && printTrigger !== "off") || (hasKitchenPrinter && kitchenAutoPrint);

  return (
    <Card title="Automatic printing">
      <View style={styles.block}>
        <Text style={styles.label}>Customer receipt</Text>
        {hasCashierPrinter ? (
          <>
            <SegmentedControl
              options={TRIGGER_OPTIONS}
              value={printTrigger}
              onChange={onPrintTrigger}
              accessibilityPrefix="Receipt prints"
            />
            <Text style={styles.hint}>{TRIGGER_HINTS[printTrigger]}</Text>
          </>
        ) : (
          <Text style={styles.hint}>Set a printer to print Receipts to choose when they print.</Text>
        )}
      </View>

      <View style={[styles.block, styles.blockDivider]}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.label}>Kitchen ticket</Text>
            <Text style={styles.hint}>
              {hasKitchenPrinter
                ? "Prints the moment a new order arrives."
                : "Set a printer to print Kitchen tickets to turn this on."}
            </Text>
          </View>
          <Switch
            value={kitchenAutoPrint && hasKitchenPrinter}
            onValueChange={onKitchenAutoPrint}
            disabled={!hasKitchenPrinter}
            accessibilityLabel="Kitchen ticket auto-print"
          />
        </View>
      </View>

      {isAnythingAutomatic ? (
        <Text style={styles.footnote}>Keep the app open — printing pauses while it is in the background.</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { paddingVertical: spacing.sm },
  blockDivider: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingTop: spacing.lg,
  },
  label: { ...typography.body, fontWeight: "600", color: colors.textPrimary, marginBottom: spacing.sm },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchCopy: { flex: 1 },
  footnote: { ...typography.small, color: colors.textTertiary, marginTop: spacing.lg },
});

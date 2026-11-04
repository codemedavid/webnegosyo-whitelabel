import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet } from "../drawer/DrawerSheet";
import type { RegisteredPrinter } from "../../lib/printer-registry";
import type { ReprintGate } from "../../lib/reprint-gate";
import { ReprintButton, type ReprintStatus } from "./ReprintButton";

interface OrderPrintActionsProps {
  gate: ReprintGate;
  status: ReprintStatus;
  /** Receipt printers on this device; two or more opens the picker. */
  targets: readonly RegisteredPrinter[];
  onReprint: (printerId?: string) => void;
  onOpenPrinterSettings: () => void;
  /** Shown only when a kitchen printer is saved and the order is not cancelled. */
  kitchenChit?: { label: string; isPrinting: boolean; onPress: () => void } | null;
}

/**
 * The order's paper: "Reprint receipt" on every order that was sold —
 * delivered ones included, which is when a customer comes back for it — and
 * "Print kitchen chit" where a kitchen printer is saved. A device with no
 * receipt printer says so and links to Printer settings instead of hiding the
 * button. With two or more receipt printers the cashier picks one.
 */
export function OrderPrintActions({
  gate,
  status,
  targets,
  onReprint,
  onOpenPrinterSettings,
  kitchenChit,
}: OrderPrintActionsProps) {
  const [isPickerOpen, setPickerOpen] = useState(false);
  if (!gate.show && !kitchenChit) return null;

  const handleReprint = () => {
    if (targets.length >= 2) setPickerOpen(true);
    else onReprint(targets[0]?.id);
  };

  return (
    <View style={styles.wrap} testID="order-print-actions">
      {gate.show && gate.enabled ? <ReprintButton status={status} onPress={handleReprint} /> : null}
      {gate.show && !gate.enabled ? (
        <View style={styles.unavailable}>
          <Button
            label="Reprint receipt"
            icon="printer"
            tone="secondary"
            disabled
            fullWidth
            onPress={() => undefined}
            accessibilityHint={gate.reason ?? undefined}
          />
          <Text style={styles.reason}>{gate.reason}</Text>
          <Button label="Printer settings" icon="settings" tone="ghost" onPress={onOpenPrinterSettings} />
        </View>
      ) : null}
      {kitchenChit ? (
        <Button
          label={kitchenChit.label}
          icon="printer"
          tone="secondary"
          fullWidth
          isLoading={kitchenChit.isPrinting}
          onPress={kitchenChit.onPress}
        />
      ) : null}
      <DrawerSheet
        visible={isPickerOpen}
        title="Print on which printer?"
        subtitle="The copy is marked REPRINT."
        onClose={() => setPickerOpen(false)}
      >
        <View style={styles.list}>
          {targets.map((printer) => (
            <Button
              key={printer.id}
              label={printer.name}
              icon="printer"
              tone="secondary"
              size="lg"
              onPress={() => {
                setPickerOpen(false);
                onReprint(printer.id);
              }}
            />
          ))}
        </View>
      </DrawerSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  unavailable: { gap: spacing.xs, alignItems: "center" },
  reason: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  list: { gap: spacing.sm, paddingTop: spacing.sm },
});

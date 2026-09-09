import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Icon } from "../Icon";
import { SegmentedControl } from "../SegmentedControl";
import {
  PRINTER_ROLES,
  PAPER_WIDTHS,
  DEFAULT_PAPER_WIDTH,
  DEFAULT_QR_MODE,
  type PaperWidth,
  type PrinterRole,
  type QrMode,
  type RegisteredPrinter,
} from "../../lib/printer-registry";

export type TestPrintStatus = "printing" | "sent" | null;

const ROLE_LABELS: Record<PrinterRole, string> = {
  cashier: "Receipts",
  kitchen: "Kitchen tickets",
};

const PAPER_OPTIONS = PAPER_WIDTHS.map((width) => ({ label: `${width}mm`, value: width }));

/**
 * Native lets the printer's firmware draw the tracking QR from a short
 * command — fast, crisp, and what nearly every head supports. Image is the
 * escape hatch for a firmware that prints the command as gibberish.
 */
const QR_OPTIONS: { label: string; value: QrMode }[] = [
  { label: "Printer draws it", value: "native" },
  { label: "Send as image", value: "image" },
];

/** "Bluetooth · Receipts · 58mm" — everything that matters, in one glance. */
export function describePrinter(printer: RegisteredPrinter): string {
  const roles = printer.roles.map((role) => ROLE_LABELS[role]).join(" + ");
  return [printer.type === "bluetooth" ? "Bluetooth" : "Network", roles, `${printer.paperWidth ?? DEFAULT_PAPER_WIDTH}mm`].join(
    " · ",
  );
}

interface PrinterRowProps {
  printer: RegisteredPrinter;
  isConnected: boolean;
  isExpanded: boolean;
  testStatus: TestPrintStatus;
  isLast: boolean;
  onToggleExpanded: () => void;
  onTestPrint: () => void;
  onToggleRole: (role: PrinterRole) => void;
  onPaperWidth: (width: PaperWidth) => void;
  onQrMode: (mode: QrMode) => void;
  onRemove: () => void;
}

/**
 * One saved printer: a single glanceable line, with its settings folded
 * away until the row is tapped. Every printer used to show every chip at
 * once — roles, paper, QR, two buttons — which is what made the screen read
 * as a control panel rather than a list.
 */
export function PrinterRow({
  printer,
  isConnected,
  isExpanded,
  testStatus,
  isLast,
  onToggleExpanded,
  onTestPrint,
  onToggleRole,
  onPaperWidth,
  onQrMode,
  onRemove,
}: PrinterRowProps) {
  const printsReceipts = printer.roles.includes("cashier");

  return (
    <View style={[styles.wrap, !isLast && styles.divider]}>
      <TouchableOpacity
        style={styles.summary}
        onPress={onToggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={`${printer.name}. ${describePrinter(printer)}. ${isConnected ? "Connected" : "Not connected"}`}
      >
        <View style={[styles.dot, isConnected ? styles.dotOn : styles.dotOff]} />
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>
            {printer.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {describePrinter(printer)}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.testButton, testStatus === "sent" && styles.testButtonSent]}
          onPress={onTestPrint}
          disabled={testStatus !== null}
          accessibilityRole="button"
          accessibilityLabel={`Test print on ${printer.name}`}
        >
          {testStatus === "printing" ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : testStatus === "sent" ? (
            <Icon name="check" size={16} color={colors.success} />
          ) : (
            <Text style={styles.testText}>Test</Text>
          )}
        </TouchableOpacity>
        <Icon name="chevron" size={18} color={colors.textTertiary} />
      </TouchableOpacity>

      {isExpanded ? (
        <View style={styles.detail}>
          <Text style={styles.fieldLabel}>Prints</Text>
          <View style={styles.chipRow}>
            {PRINTER_ROLES.map((role) => {
              const isActive = printer.roles.includes(role);
              return (
                <TouchableOpacity
                  key={role}
                  style={[styles.chip, isActive && styles.chipActive]}
                  onPress={() => onToggleRole(role)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isActive }}
                  accessibilityLabel={ROLE_LABELS[role]}
                >
                  {isActive ? <Icon name="check" size={14} color={colors.textOnDark} /> : null}
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {ROLE_LABELS[role]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Paper width</Text>
          <SegmentedControl
            options={PAPER_OPTIONS}
            value={printer.paperWidth ?? DEFAULT_PAPER_WIDTH}
            onChange={onPaperWidth}
            accessibilityPrefix="Paper"
          />

          {printsReceipts ? (
            <>
              <Text style={styles.fieldLabel}>Tracking QR</Text>
              <SegmentedControl
                options={QR_OPTIONS}
                value={printer.qrMode ?? DEFAULT_QR_MODE}
                onChange={onQrMode}
                accessibilityPrefix="QR"
              />
              <Text style={styles.fieldHint}>
                Switch to “Send as image” only if the QR prints as scrambled text.
              </Text>
            </>
          ) : null}

          <TouchableOpacity
            style={styles.remove}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${printer.name}`}
          >
            <Icon name="trash" size={16} color={colors.danger} />
            <Text style={styles.removeText}>Remove printer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.xs },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  summary: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: colors.success },
  dotOff: { backgroundColor: colors.textTertiary },
  copy: { flex: 1 },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  testButton: {
    minWidth: 56,
    alignItems: "center",
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
  },
  testButtonSent: { backgroundColor: colors.successLight },
  testText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  detail: { paddingBottom: spacing.md, paddingLeft: spacing.md + 10 },
  fieldLabel: { ...typography.eyebrow, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm },
  fieldHint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.full,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: "600", color: colors.textSecondary },
  chipTextActive: { color: colors.textOnDark },
  remove: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.lg, alignSelf: "flex-start" },
  removeText: { ...typography.caption, fontWeight: "600", color: colors.danger },
});

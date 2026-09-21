import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Icon } from "../Icon";
import { SegmentedControl } from "../SegmentedControl";
import {
  canScanFor,
  healthActionLabel,
  healthNotice,
  healthSummary,
  healthTone,
  shouldTestPrint,
  type PrinterHealth,
} from "../../lib/printer-health";
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

/**
 * What the row's action button is doing right now. "busy" covers connecting,
 * scanning and printing alike — from the counter they are the same wait.
 */
export type RowActivity = "busy" | "sent" | null;

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
  /** What this device knows about the printer — drives the whole row. */
  health: PrinterHealth;
  isExpanded: boolean;
  activity: RowActivity;
  isLast: boolean;
  onToggleExpanded: () => void;
  /** Test print when connected, connect or reconnect otherwise. */
  onAction: () => void;
  /** Hunt for a Bluetooth printer that stopped answering. */
  onScan: () => void;
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
 *
 * The action button follows what the app actually knows about the printer.
 * Offering "Test" on a printer nobody has reached sends the tap straight into
 * the connect-then-broken-pipe path and comes back as an error the cashier
 * can do nothing with; the row asks for a connection first instead.
 */
export function PrinterRow({
  printer,
  health,
  isExpanded,
  activity,
  isLast,
  onToggleExpanded,
  onAction,
  onScan,
  onToggleRole,
  onPaperWidth,
  onQrMode,
  onRemove,
}: PrinterRowProps) {
  const printsReceipts = printer.roles.includes("cashier");
  const tone = healthTone(health.status);
  const notice = healthNotice(health);
  const actionLabel = healthActionLabel(health.status);
  const isBusy = activity === "busy" || health.status === "connecting";
  const showScan = canScanFor(printer, health.status);
  // Only a connected printer prints a test page; everything else connects.
  const isTestAction = shouldTestPrint(health.status);

  return (
    <View style={[styles.wrap, !isLast && styles.divider]}>
      <TouchableOpacity
        style={styles.summary}
        onPress={onToggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={`${printer.name}. ${describePrinter(printer)}. ${healthSummary(health.status)}`}
      >
        <View style={[styles.dot, tone === "on" ? styles.dotOn : tone === "warn" ? styles.dotWarn : styles.dotOff]} />
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>
            {printer.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {describePrinter(printer)}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.actionButton,
            activity === "sent" && styles.actionButtonSent,
            !isTestAction && !isBusy && styles.actionButtonConnect,
          ]}
          onPress={onAction}
          disabled={isBusy || activity === "sent"}
          accessibilityRole="button"
          accessibilityLabel={
            isTestAction ? `Test print on ${printer.name}` : `${actionLabel} ${printer.name}`
          }
        >
          {isBusy ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : activity === "sent" ? (
            <Icon name="check" size={16} color={colors.success} />
          ) : (
            <Text style={[styles.actionText, !isTestAction && styles.actionTextConnect]}>
              {actionLabel}
            </Text>
          )}
        </TouchableOpacity>
        <Icon name="chevron" size={18} color={colors.textTertiary} />
      </TouchableOpacity>

      {notice ? (
        <View style={styles.notice}>
          <Icon
            name={health.status === "unreachable" ? "warning" : "info"}
            size={14}
            color={health.status === "unreachable" ? colors.warning : colors.textSecondary}
          />
          <Text style={styles.noticeText}>{notice}</Text>
          {showScan ? (
            <TouchableOpacity
              onPress={onScan}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel={`Scan for ${printer.name}`}
            >
              <Text style={styles.noticeAction}>Scan for it</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

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
  dotWarn: { backgroundColor: colors.warning },
  dotOff: { backgroundColor: colors.textTertiary },
  copy: { flex: 1 },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  actionButton: {
    minWidth: 56,
    alignItems: "center",
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
  },
  actionButtonSent: { backgroundColor: colors.successLight },
  actionButtonConnect: { backgroundColor: colors.primary },
  actionText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  actionTextConnect: { color: colors.textOnDark },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
    paddingBottom: spacing.sm,
    paddingLeft: spacing.md + 10,
  },
  noticeText: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  noticeAction: { ...typography.caption, fontWeight: "700", color: colors.primary },
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

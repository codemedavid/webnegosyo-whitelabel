import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme/colors";
import type { DateRangePreset } from "../lib/product-analytics-filters";

/**
 * The bottom sheet every export entry point shares.
 *
 * Purely presentational: the screen owns fetching, CSV building, and the
 * share call. This owns only the merchant's choice of window and the three
 * states of the attempt (idle, busy, failed) — so orders, sales, and
 * customers all export through one surface that behaves the same way.
 */

const PRESETS: readonly { label: string; value: DateRangePreset }[] = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
];

const DEFAULT_PRESET: DateRangePreset = "7d";

interface ExportSheetProps {
  visible: boolean;
  title: string;
  isBusy: boolean;
  /** "Includes orders since … only." when the fetch cap truncated the window. */
  coverageNote?: string | null;
  errorMessage?: string | null;
  /** Hide the window pickers for exports that are not dated (customer list). */
  showPresets?: boolean;
  onExport: (preset: DateRangePreset) => void;
  onClose: () => void;
}

export function ExportSheet({
  visible,
  title,
  isBusy,
  coverageNote,
  errorMessage,
  showPresets = true,
  onExport,
  onClose,
}: ExportSheetProps) {
  const [preset, setPreset] = useState<DateRangePreset>(DEFAULT_PRESET);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>

          {showPresets && (
            <View style={styles.presetRow}>
              {PRESETS.map((option) => {
                const isSelected = option.value === preset;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.preset, isSelected && styles.presetSelected]}
                    onPress={() => setPreset(option.value)}
                    disabled={isBusy}
                  >
                    <Text
                      style={[styles.presetLabel, isSelected && styles.presetLabelSelected]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {coverageNote ? <Text style={styles.coverage}>{coverageNote}</Text> : null}
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <TouchableOpacity
            style={[styles.exportButton, isBusy && styles.exportButtonBusy]}
            onPress={() => onExport(preset)}
            disabled={isBusy}
          >
            <Text style={styles.exportLabel}>{isBusy ? "Exporting…" : "Export CSV"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={isBusy}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  presetRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  preset: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
  },
  presetSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  presetLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  presetLabelSelected: {
    color: colors.accent,
    fontWeight: "600",
  },
  coverage: {
    ...typography.small,
    color: colors.textSecondary,
  },
  error: {
    ...typography.small,
    color: colors.danger,
  },
  exportButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  exportButtonBusy: {
    opacity: 0.6,
  },
  exportLabel: {
    ...typography.body,
    fontWeight: "700",
    color: colors.card,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  cancelLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

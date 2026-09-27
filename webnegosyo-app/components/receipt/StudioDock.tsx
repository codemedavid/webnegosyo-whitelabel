import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../../theme/colors";
import { Icon, type IconName } from "../Icon";
import { studio } from "./studio-theme";

/**
 * The bottom bar while no block is selected: the whole-receipt tools on the
 * left, and adding a block — the thing a merchant building a receipt does
 * most — as the one filled button, under the right thumb.
 */

interface ToolProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  isBusy?: boolean;
  disabled?: boolean;
}

function Tool({ icon, label, onPress, isBusy, disabled }: ToolProps) {
  return (
    <TouchableOpacity
      style={[styles.tool, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled || isBusy}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!isBusy }}
    >
      {isBusy ? (
        <ActivityIndicator size="small" color={studio.canvasText} />
      ) : (
        <Icon name={icon} size={21} color={studio.canvasText} />
      )}
      <Text style={styles.toolLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface StudioDockProps {
  templateLabel: string;
  isPrinting: boolean;
  isLocked: boolean;
  onTemplates: () => void;
  onPaperStyle: () => void;
  onPrintSample: () => void;
  onAdd: () => void;
}

export function StudioDock({
  templateLabel,
  isPrinting,
  isLocked,
  onTemplates,
  onPaperStyle,
  onPrintSample,
  onAdd,
}: StudioDockProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <Tool icon="list" label={templateLabel} onPress={onTemplates} />
      <Tool icon="settings" label="Style" onPress={onPaperStyle} disabled={isLocked} />
      <Tool icon="printer" label={isPrinting ? "Printing" : "Test print"} onPress={onPrintSample} isBusy={isPrinting} />
      <TouchableOpacity
        style={[styles.add, isLocked && styles.disabled]}
        onPress={onAdd}
        disabled={isLocked}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add a block"
      >
        <Icon name="plus" size={20} color={colors.textOnDark} strokeWidth={2.25} />
        <Text style={styles.addLabel}>Add</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: studio.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: studio.canvasHairline,
  },
  tool: { flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 4 },
  toolLabel: { fontSize: 11, fontWeight: "700", color: studio.canvasMuted },
  disabled: { opacity: 0.35 },
  add: {
    height: 52,
    paddingHorizontal: spacing.xl,
    marginLeft: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addLabel: { fontSize: 16, fontWeight: "800", color: colors.textOnDark },
});

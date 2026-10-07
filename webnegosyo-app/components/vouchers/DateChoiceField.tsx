import React, { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Modal } from "../Modal";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { formatShortDate } from "../../lib/voucher-admin/voucher-status";

/**
 * One date on a voucher, chosen the way merchants actually decide it.
 *
 * Almost every promotion is "starting now" and "for a week" or "for a month",
 * so those are one tap. The calendar is there for the rest. On Android the
 * system picker is already a dialog; iOS draws it inline, so it gets a small
 * sheet with a Done button rather than a calendar that appears mid-form.
 */

export interface DatePreset {
  label: string;
  iso: string;
}

interface DateChoiceFieldProps {
  label: string;
  /** ISO timestamp, or null for the empty choice. */
  value: string | null;
  /** The choice that means "no date", e.g. "Right away" or "No end date". */
  emptyLabel: string;
  presets: readonly DatePreset[];
  /** Turns the calendar's chosen day into the stored timestamp (start or end of that day). */
  toIso: (day: Date) => string;
  onChange: (iso: string | null) => void;
  minimumDate?: Date;
  error?: string | null;
}

export function DateChoiceField({
  label,
  value,
  emptyLabel,
  presets,
  toIso,
  onChange,
  minimumDate,
  error,
}: DateChoiceFieldProps) {
  const [isPicking, setIsPicking] = useState(false);
  const [iosDay, setIosDay] = useState<Date>(new Date());

  const matchedPreset = value ? presets.find((preset) => preset.iso === value) : undefined;
  const isCustom = value !== null && !matchedPreset;
  const valueMs = value ? Date.parse(value) : Number.NaN;
  const summary = value && !Number.isNaN(valueMs) ? formatShortDate(valueMs) : emptyLabel;

  const openCalendar = () => {
    setIosDay(Number.isNaN(valueMs) ? minimumDate ?? new Date() : new Date(valueMs));
    setIsPicking(true);
  };

  const onAndroidPick = (event: DateTimePickerEvent, picked?: Date) => {
    // Close first: a dismissed dialog must still let the next tap reopen it.
    setIsPicking(false);
    if (event.type === "dismissed" || !picked) return;
    onChange(toIso(picked));
  };

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.summary}>{summary}</Text>
      </View>

      <View style={styles.chips}>
        <Chip label={emptyLabel} isActive={value === null} onPress={() => onChange(null)} />
        {presets.map((preset) => (
          <Chip
            key={preset.label}
            label={preset.label}
            isActive={matchedPreset?.label === preset.label}
            onPress={() => onChange(preset.iso)}
          />
        ))}
        <Chip
          label={isCustom ? summary : "Pick date"}
          icon="calendar"
          isActive={isCustom}
          onPress={openCalendar}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isPicking && Platform.OS !== "ios" ? (
        <DateTimePicker
          mode="date"
          value={Number.isNaN(valueMs) ? minimumDate ?? new Date() : new Date(valueMs)}
          minimumDate={minimumDate}
          onChange={onAndroidPick}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal visible={isPicking} transparent animationType="fade" onRequestClose={() => setIsPicking(false)}>
          <View style={styles.backdrop}>
            <View style={styles.calendarCard}>
              <Text style={styles.calendarTitle}>{label}</Text>
              <DateTimePicker
                mode="date"
                display="inline"
                value={iosDay}
                minimumDate={minimumDate}
                onChange={(_event, picked) => picked && setIosDay(picked)}
                themeVariant="light"
                accentColor={colors.accent}
              />
              <View style={styles.calendarActions}>
                <TouchableOpacity
                  style={styles.calendarButton}
                  onPress={() => setIsPicking(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.calendarCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.calendarButton, styles.calendarDone]}
                  onPress={() => {
                    setIsPicking(false);
                    onChange(toIso(iosDay));
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.calendarDoneText}>Use {formatShortDate(iosDay.getTime())}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  isActive,
  onPress,
  icon,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  icon?: "calendar";
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, isActive && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={label}
    >
      {icon ? <Icon name={icon} size={15} color={isActive ? colors.textOnDark : colors.textPrimary} /> : null}
      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.md },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  summary: { ...typography.caption, color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  chipTextActive: { color: colors.textOnDark },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.xs },

  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(29,24,21,0.45)",
  },
  calendarCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg },
  calendarTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  calendarActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  calendarButton: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
  },
  calendarCancel: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  calendarDone: { backgroundColor: colors.primary },
  calendarDoneText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
});

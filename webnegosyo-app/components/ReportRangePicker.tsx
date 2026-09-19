import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { IconButton } from "./IconButton";
import { buildMonthGrid, monthCursorOf, monthTitle, shiftMonth } from "../lib/schedule-calendar";
import {
  beginDraft,
  draftSelection,
  isDayInDraft,
  setDraftMode,
  tapDay,
  type DraftMode,
} from "../lib/report-range-picker";
import {
  MAX_RANGE_DAYS,
  describeSelection,
  rangeDayCount,
  type ReportSelection,
} from "../lib/report-window";

/**
 * "Which days is this report about?"
 *
 * The pills answer only "the last N days, ending now", so a merchant could
 * never ask how the 3rd went, or compare the first half of a month with the
 * second. This sheet is the one place they say it exactly — one day, or a
 * range — and it drives every report the same way.
 *
 * The month grid is the Schedule tab's, reused rather than rebuilt: a second
 * calendar is a second place for February to be wrong.
 *
 * Every decision about what a tap MEANS lives in lib/report-range-picker.ts,
 * so this component only renders a draft and reports taps.
 */
interface ReportRangePickerProps {
  visible: boolean;
  /** What the report is showing now — the sheet opens on it. */
  selection: ReportSelection;
  nowMs: number;
  onApply: (selection: ReportSelection) => void;
  onClose: () => void;
}

const WEEKDAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"] as const;

const MODES: readonly { label: string; value: DraftMode }[] = [
  { label: "Single day", value: "day" },
  { label: "Range", value: "range" },
];

export function ReportRangePicker({
  visible,
  selection,
  nowMs,
  onApply,
  onClose,
}: ReportRangePickerProps) {
  // Keyed on `visible` so reopening the sheet starts from what the report is
  // actually showing, not from a half-built range abandoned last time.
  const [draft, setDraft] = useState(() => beginDraft(selection, nowMs));
  const [cursor, setCursor] = useState(() => monthCursorOf(nowMs));
  const [openedFor, setOpenedFor] = useState(visible);

  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) {
      setDraft(beginDraft(selection, nowMs));
      setCursor(monthCursorOf(nowMs));
    }
  }

  const rows = useMemo(() => buildMonthGrid(cursor, nowMs), [cursor, nowMs]);
  const pending = draftSelection(draft);
  const tooWide = pending !== null && rangeDayCount(pending, nowMs) > MAX_RANGE_DAYS;

  const summary = pending
    ? describeSelection(pending, nowMs)
    : draft.mode === "range"
      ? "Tap the last day"
      : "Tap a day";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Pick dates</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.close}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modeRow}>
            {MODES.map((mode) => {
              const active = draft.mode === mode.value;
              return (
                <TouchableOpacity
                  key={mode.value}
                  style={[styles.modePill, active && styles.modePillActive]}
                  onPress={() => setDraft(setDraftMode(draft, mode.value))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.modeText, active && styles.modeTextActive]}>
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.monthBar}>
            <IconButton
              icon="chevron-left"
              label="Previous month"
              onPress={() => setCursor(shiftMonth(cursor, -1))}
            />
            <Text style={styles.monthTitle}>{monthTitle(cursor)}</Text>
            <IconButton
              icon="chevron"
              label="Next month"
              onPress={() => setCursor(shiftMonth(cursor, 1))}
            />
          </View>

          <View style={styles.weekdays}>
            {WEEKDAY_HEADERS.map((label, index) => (
              <Text key={`${label}-${index}`} style={styles.weekday}>
                {label}
              </Text>
            ))}
          </View>

          <ScrollView style={styles.grid}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.week}>
                {row.map((cell) => {
                  // A future day is empty by definition, and an empty report is
                  // indistinguishable from one whose data went missing.
                  const isFuture = !cell.isPast && !cell.isToday;
                  const chosen = isDayInDraft(draft, cell.key);
                  return (
                    <TouchableOpacity
                      key={cell.key}
                      style={[
                        styles.cell,
                        chosen && styles.cellChosen,
                        isFuture && styles.cellDisabled,
                      ]}
                      disabled={isFuture}
                      onPress={() => setDraft(tapDay(draft, cell.key, nowMs))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: chosen, disabled: isFuture }}
                      accessibilityLabel={cell.key}
                    >
                      <Text
                        style={[
                          styles.cellText,
                          !cell.isCurrentMonth && styles.cellTextMuted,
                          chosen && styles.cellTextChosen,
                          isFuture && styles.cellTextMuted,
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.summary}>{summary}</Text>
            {tooWide && (
              <Text style={styles.warning}>
                {`Reports cover at most ${MAX_RANGE_DAYS} days.`}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.apply, (!pending || tooWide) && styles.applyDisabled]}
              disabled={!pending || tooWide}
              onPress={() => {
                if (pending) onApply(pending);
              }}
              accessibilityRole="button"
              accessibilityLabel="Apply"
              accessibilityState={{ disabled: !pending || tooWide }}
            >
              <Text style={styles.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: "88%",
    ...shadow.sm,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...typography.heading, color: colors.textPrimary },
  close: { ...typography.body, color: colors.primary, fontWeight: "600" },
  modeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  modePill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  modePillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  modeTextActive: { color: colors.textOnDark },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  monthTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  weekdays: { flexDirection: "row", marginTop: spacing.md },
  weekday: {
    flex: 1,
    textAlign: "center",
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: "700",
  },
  grid: { marginTop: spacing.sm },
  week: { flexDirection: "row" },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    margin: 1,
  },
  cellChosen: { backgroundColor: colors.primary },
  cellDisabled: { opacity: 0.35 },
  cellText: { ...typography.body, color: colors.textPrimary },
  cellTextMuted: { color: colors.textTertiary },
  cellTextChosen: { color: colors.textOnDark, fontWeight: "700" },
  footer: { marginTop: spacing.lg, gap: spacing.sm },
  summary: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  warning: { ...typography.caption, color: colors.danger, textAlign: "center" },
  apply: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  applyDisabled: { opacity: 0.4 },
  applyText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
});

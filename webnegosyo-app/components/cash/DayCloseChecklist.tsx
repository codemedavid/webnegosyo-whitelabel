import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";
import { buildDayCloseChecklist, type ChecklistRow, type ChecklistTone, type DayCloseStatusLike } from "./day-close-checklist";

interface DayCloseChecklistProps {
  status: DayCloseStatusLike;
  /** How many shifts of the day ended (from the preview's drawer rows), for "3 shifts ended". */
  endedShiftCount?: number;
  onEndShift: (shiftId: string) => void;
  onReviewRemittances: () => void;
  onReviewNonCash: (shiftId: string) => void;
  isOffline?: boolean;
}

interface ToneLook {
  icon: IconName;
  ink: string;
  wash: string;
  /** Said before the row, so the state never rests on the icon's colour. */
  word: string;
}

const LOOKS: Record<ChecklistTone, ToneLook> = {
  done: { icon: "check", ink: colors.success, wash: colors.successLight, word: "Done" },
  block: { icon: "close", ink: colors.danger, wash: colors.dangerLight, word: "Needed" },
  warn: { icon: "warning", ink: colors.statusPending.text, wash: colors.warningLight, word: "Check" },
};

function Row({ row, onAction, isDisabled }: { row: ChecklistRow; onAction: (row: ChecklistRow) => void; isDisabled: boolean }) {
  const look = LOOKS[row.tone];
  return (
    <View style={styles.row}>
      <View style={styles.rowMain} accessible accessibilityLabel={`${look.word}: ${row.title}`}>
        <View style={[styles.well, { backgroundColor: look.wash }]}>
          <Icon name={look.icon} size={16} color={look.ink} strokeWidth={2.25} />
        </View>
        <Text style={styles.title}>{row.title}</Text>
      </View>
      {row.action ? (
        <Button
          label={row.action.label}
          tone={row.tone === "block" ? "primary" : "secondary"}
          size="sm"
          fullWidth={false}
          onPress={() => onAction(row)}
          disabled={isDisabled}
          testID={`checklist-action-${row.key}`}
        />
      ) : null}
    </View>
  );
}

/**
 * The "Before you close" card: tick rows, each unmet one with its one-tap fix
 * (End their shift · Review · Look). Whether Close is allowed, or asks "Close
 * anyway?", comes from `dayCloseReadiness` — the screen owns those buttons.
 */
export function DayCloseChecklist({ status, endedShiftCount, onEndShift, onReviewRemittances, onReviewNonCash, isOffline = false }: DayCloseChecklistProps) {
  const rows = buildDayCloseChecklist(status, { endedShiftCount });
  const act = (row: ChecklistRow) => {
    const action = row.action;
    if (!action) return;
    if (action.kind === "end_shift" && action.targetId) onEndShift(action.targetId);
    if (action.kind === "review_remittances") onReviewRemittances();
    if (action.kind === "review_non_cash" && action.targetId) onReviewNonCash(action.targetId);
  };
  return (
    <View style={styles.card} testID="day-close-checklist">
      <Text style={styles.heading} accessibilityRole="header">
        Before you close
      </Text>
      {rows.map((row) => (
        <Row key={row.key} row={row} onAction={act} isDisabled={isOffline} />
      ))}
    </View>
  );
}

const WELL = 28;

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  heading: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  well: { width: WELL, height: WELL, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  title: { ...typography.body, flex: 1, color: colors.textPrimary },
});

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatPeso } from "../../lib/format";
import { toBusinessDayKey } from "../../lib/daily-report/business-day";
import { formatClock, formatDayLabel, formatShiftLength } from "../../lib/staff-format";
import {
  shiftDurationMs,
  shiftTurnover,
  verdictForShift,
  type ShiftVerdictKind,
} from "../../lib/staff-activity/shift-summary";
import type { ShiftRecord } from "../../lib/shift-service";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { EmptyState } from "../EmptyState";

/**
 * Every drawer this person held, and whether it balanced.
 *
 * The verdict is the thing the owner reads first, so it is a coloured pill on
 * the same line as the day. An uncounted drawer says "Not counted" rather
 * than showing ₱0 — a missing count is a different fact from a perfect one,
 * and only one of them is anybody's fault.
 */

const VERDICT: Record<ShiftVerdictKind, { label: string; bg: string; fg: string }> = {
  open: { label: "Open now", bg: colors.successLight, fg: colors.success },
  uncounted: { label: "Not counted", bg: colors.surfaceSubtle, fg: colors.textSecondary },
  balanced: { label: "Balanced", bg: colors.successLight, fg: colors.success },
  short: { label: "Short", bg: colors.dangerLight, fg: colors.danger },
  over: { label: "Over", bg: colors.warningLight, fg: colors.statusPending.text },
};

interface ShiftHistoryListProps {
  shifts: readonly ShiftRecord[];
  nowMs: number;
  nowIso: string;
  /** Branch names by id — omitted on a single-branch store. */
  branchName?: (outletId: string | null) => string;
}

export function ShiftHistoryList({ shifts, nowMs, nowIso, branchName }: ShiftHistoryListProps) {
  if (shifts.length === 0) {
    return (
      <EmptyState
        icon="drawer"
        title="No shifts in this period"
        message="Shifts appear here once they open the drawer on the register."
        inset
      />
    );
  }

  return (
    <View style={styles.list}>
      {shifts.map((shift) => {
        const verdict = verdictForShift(shift);
        const tone = VERDICT[verdict.kind];
        const turnover = shiftTurnover(shift);

        return (
          <View key={shift.id} style={styles.card}>
            <View style={styles.head}>
              <View style={styles.headCopy}>
                <Text style={styles.day}>
                  {formatDayLabel(toBusinessDayKey(shift.openedAt), nowIso)}
                </Text>
                <Text style={styles.when} numberOfLines={1}>
                  {formatClock(shift.openedAt)} –{" "}
                  {shift.closedAt ? formatClock(shift.closedAt) : "still open"} ·{" "}
                  {formatShiftLength(shiftDurationMs(shift, nowMs))}
                  {branchName ? ` · ${branchName(shift.outletId)}` : ""}
                </Text>
              </View>
              <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                <Text style={[styles.pillText, { color: tone.fg }]}>
                  {tone.label}
                  {verdict.variance !== null && verdict.variance !== 0
                    ? ` ${formatPeso(Math.abs(verdict.variance))}`
                    : ""}
                </Text>
              </View>
            </View>

            <View style={styles.figures}>
              <View style={styles.figure}>
                <Text style={styles.figureLabel}>Float</Text>
                <Text style={styles.figureValue}>{formatPeso(shift.openingFloat)}</Text>
              </View>
              <View style={styles.figure}>
                <Text style={styles.figureLabel}>Cash turned in</Text>
                <Text style={styles.figureValue}>
                  {turnover === null ? "—" : formatPeso(turnover)}
                </Text>
              </View>
              <View style={styles.figure}>
                <Text style={styles.figureLabel}>Counted</Text>
                <Text style={styles.figureValue}>
                  {shift.closingCount === null ? "—" : formatPeso(shift.closingCount)}
                </Text>
              </View>
            </View>

            {shift.note ? <Text style={styles.note}>“{shift.note}”</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  headCopy: { flex: 1, gap: 2 },
  day: { ...typography.heading, color: colors.textPrimary },
  when: { ...typography.caption, color: colors.textSecondary },
  pill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  pillText: { ...typography.small, fontWeight: "700" },
  figures: {
    flexDirection: "row",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingTop: spacing.md,
  },
  figure: { flex: 1, gap: 2 },
  figureLabel: { ...typography.small, color: colors.textTertiary },
  figureValue: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  note: { ...typography.caption, fontStyle: "italic", color: colors.textSecondary },
});

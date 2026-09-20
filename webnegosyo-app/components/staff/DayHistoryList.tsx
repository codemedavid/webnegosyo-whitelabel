import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatPeso } from "../../lib/format";
import { formatClock, formatDayLabel, formatShiftLength } from "../../lib/staff-format";
import { classifyActivity, type ActivityKind, type ActivitySummary } from "../../lib/staff-activity/activity";
import type { DayActivity } from "../../lib/staff-activity/staff-directory";
import { shiftDurationMs } from "../../lib/staff-activity/shift-summary";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { EmptyState } from "../EmptyState";

/**
 * What this person did, day by day.
 *
 * A flat feed answers "what happened at 3:14pm", which nobody asks. The day
 * is the unit an owner thinks in — "was Tuesday quiet, and who was on?" — so
 * each day leads with its own totals and the drawer that was open, and the
 * individual acts sit underneath for when the totals raise a question.
 */

const KIND: Record<ActivityKind, { label: string; bg: string; fg: string }> = {
  pos_sale: { label: "POS sale", bg: colors.infoLight, fg: colors.info },
  confirmed: { label: "Confirmed", bg: colors.successLight, fg: colors.success },
  completed: { label: "Completed", bg: colors.statusDelivered.bg, fg: colors.statusDelivered.text },
  cancelled: { label: "Cancelled", bg: colors.dangerLight, fg: colors.danger },
  progressed: { label: "Moved", bg: colors.surfaceSubtle, fg: colors.textSecondary },
};

/** The last six characters of the order id — what a receipt shows. */
function orderRef(externalOrderId: string): string {
  return `#${externalOrderId.slice(-6).toUpperCase()}`;
}

function daySummary(summary: ActivitySummary): string {
  const parts = [
    summary.posSales > 0 ? `${summary.posSales} rang up (${formatPeso(summary.posSalesTotal, 0)})` : null,
    summary.confirmed > 0 ? `${summary.confirmed} confirmed` : null,
    summary.completed > 0 ? `${summary.completed} completed` : null,
    summary.cancelled > 0 ? `${summary.cancelled} cancelled` : null,
    summary.progressed > 0 ? `${summary.progressed} moved` : null,
  ].filter(Boolean) as string[];

  return parts.length === 0 ? "On shift, no orders handled" : parts.join(" · ");
}

interface DayHistoryListProps {
  days: readonly DayActivity[];
  nowIso: string;
  nowMs: number;
  /** True when the window hit the row ceiling upstream. */
  isTruncated?: boolean;
}

export function DayHistoryList({ days, nowIso, nowMs, isTruncated = false }: DayHistoryListProps) {
  if (days.length === 0) {
    return (
      <EmptyState
        icon="list"
        title="Nothing recorded in this period"
        message="Orders they ring up, confirm or complete will appear here."
        inset
      />
    );
  }

  return (
    <View style={styles.list}>
      {isTruncated ? (
        <Text style={styles.truncated}>
          This period has more activity than one page holds. The oldest days are not shown — pick a
          shorter period.
        </Text>
      ) : null}

      {days.map((day) => (
        <View key={day.dayKey} style={styles.day}>
          <View style={styles.dayHead}>
            <Text style={styles.dayTitle}>{formatDayLabel(day.dayKey, nowIso)}</Text>
            <Text style={styles.daySummary} numberOfLines={2}>
              {daySummary(day.summary)}
            </Text>
          </View>

          {day.shifts.length > 0 ? (
            <View style={styles.shiftRow}>
              {day.shifts.map((shift) => (
                <View key={shift.id} style={styles.shiftChip}>
                  <Text style={styles.shiftChipText}>
                    {formatClock(shift.openedAt)} –{" "}
                    {shift.closedAt ? formatClock(shift.closedAt) : "now"} ·{" "}
                    {formatShiftLength(shiftDurationMs(shift, nowMs))}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {day.events.map((event) => {
            const tone = KIND[classifyActivity(event)];
            return (
              <View key={event.id} style={styles.event}>
                <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
                </View>
                <Text style={styles.ref} numberOfLines={1}>
                  {orderRef(event.externalOrderId)}
                  {event.source === "online" ? " · web order" : ""}
                </Text>
                <Text style={styles.when} numberOfLines={1}>
                  {event.orderTotal !== null ? `${formatPeso(event.orderTotal)} · ` : ""}
                  {formatClock(event.occurredAt)}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  truncated: {
    ...typography.caption,
    color: colors.statusPending.text,
    backgroundColor: colors.warningLight,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  day: { backgroundColor: colors.card, borderRadius: radius.md, overflow: "hidden" },
  dayHead: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 2,
  },
  dayTitle: { ...typography.heading, color: colors.textPrimary },
  daySummary: { ...typography.caption, color: colors.textSecondary },
  shiftRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  shiftChip: {
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  shiftChipText: { ...typography.small, color: colors.textSecondary },
  event: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  pill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillText: { ...typography.small, fontWeight: "700" },
  ref: { flex: 1, ...typography.small, color: colors.textSecondary },
  when: { ...typography.small, color: colors.textTertiary },
});

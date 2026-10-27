import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

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
import { summarizeShiftPayouts } from "../../lib/expenses/drawer-expenses";
import { drawerSplitText, historyPayoutText } from "../../lib/expenses/money-glance-drawer";
import { useShiftHistoryPayouts, type ShiftHistoryPayouts } from "../../lib/expenses/money-glance-hooks";
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
  /** Opens a shift's sales report (receipts, net sales, paid by). Absent = rows are not tappable. */
  onOpenShift?: (shiftId: string) => void;
}

export function ShiftHistoryList({ shifts, nowMs, nowIso, branchName, onOpenShift }: ShiftHistoryListProps) {
  // What each shift paid out, told apart into expenses and cash taken out —
  // one bounded read for the page. Until it lands (or if it cannot), the
  // pay-outs keep their free-text reasons.
  const shiftIds = useMemo(() => shifts.filter((shift) => (shift.payOuts?.length ?? 0) > 0).map((shift) => shift.id), [shifts]);
  const history = useShiftHistoryPayouts(shiftIds);

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
          <TouchableOpacity
            key={shift.id}
            style={styles.card}
            disabled={!onOpenShift}
            onPress={() => onOpenShift?.(shift.id)}
            accessibilityRole={onOpenShift ? "button" : undefined}
            accessibilityHint={onOpenShift ? "Opens this shift's sales: receipts, net sales and how they were paid" : undefined}
          >
            <View style={styles.head}>
              <View style={styles.headCopy}>
                <Text style={styles.day}>
                  {formatDayLabel(toBusinessDayKey(shift.openedAt), nowIso)}
                </Text>
                {shift.drawerName ? (
                  <Text style={styles.drawer} numberOfLines={1}>
                    {shift.drawerName}
                    {shift.isZeroBalance ? " · Zero balance" : ""}
                  </Text>
                ) : null}
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
                <Text style={styles.figureLabel}>{shift.isZeroBalance ? "Started" : "Float"}</Text>
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

            {payoutBlock(shift, history)}
            {shift.note ? <Text style={styles.note}>“{shift.note}”</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * The shift's money out: "Expenses ₱1,480 · Taken out ₱1,500" and what was
 * bought by category when the pay-outs are told apart; otherwise the older
 * "₱X paid out" with each pay-out's free-text reason.
 */
function payoutBlock(shift: ShiftRecord, history: ShiftHistoryPayouts | null): React.ReactNode {
  const moves = history?.movesByShift.get(shift.id) ?? null;
  const isSplit = moves !== null && history !== null;
  const split = isSplit ? drawerSplitText(summarizeShiftPayouts(moves, history.links), shift.moves?.collected ?? 0) : null;
  const bought = isSplit ? historyPayoutText(moves, history.links) : payOutReasons(shift);
  const extra = extras(shift, isSplit);
  return (
    <>
      {split ? <Text style={styles.split}>{split}</Text> : null}
      {extra ? <Text style={styles.extras}>{extra}</Text> : null}
      {bought ? <Text style={styles.extras}>{bought}</Text> : null}
    </>
  );
}

/** Pickups, pay ins/outs and who closed it — only the parts that happened, and not what the split line already says. */
function extras(shift: ShiftRecord, isSplit: boolean): string | null {
  const parts: string[] = [];
  if (!isSplit && shift.moves?.collected) parts.push(`${formatPeso(shift.moves.collected)} collected mid-shift`);
  if (!isSplit && shift.moves?.payOut) parts.push(`${formatPeso(shift.moves.payOut)} paid out`);
  if (shift.moves?.payIn) parts.push(`${formatPeso(shift.moves.payIn)} paid in`);
  if (shift.closedByName && shift.closedByName !== shift.staffName) parts.push(`closed by ${shift.closedByName}`);
  return parts.length ? parts.join(" · ") : null;
}

/** "Paid out for: Ice ₱85.50 · LPG ₱450.00" — so a drawer that bought ice is not read as light. */
function payOutReasons(shift: ShiftRecord): string | null {
  const payOuts = shift.payOuts ?? [];
  if (payOuts.length === 0) return null;
  const lines = payOuts.map((p) => `${p.reason ?? "No reason given"} ${formatPeso(p.amount)}`);
  return `Paid out for: ${lines.join(" · ")}`;
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
  drawer: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  extras: { ...typography.caption, color: colors.textSecondary },
  split: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
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

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { CASH_MOVE_COPY, type CashMove } from "../../lib/cash-drawers";
import { shiftSalesHref } from "../../lib/cash-routes";
import type { DrawerExpectationRead } from "../../lib/drawer-expectation";
import type { RefusedPayout } from "../../lib/expenses/expense-queue";
import { formatPeso } from "../../lib/format";
import { formatShiftElapsed } from "../../lib/shift-status";
import type { ShiftRecord } from "../../lib/shift-service";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { RefusedPayouts } from "./RefusedPayouts";

interface MyShiftCardProps {
  shift: ShiftRecord;
  expectation: DrawerExpectationRead;
  /** This shift's moves, oldest first. */
  moves: readonly CashMove[];
  /** One line about web orders handled (never in the drawer). */
  activityLine: string | null;
  nowMs: number;
  onCashMove: () => void;
  onEndShift: () => void;
  /**
   * The shift's pay-outs told apart (expenses / taken out / unsorted / undone),
   * replacing the single "Paid out" line. Null = not known yet, or no expenses here.
   */
  payoutLines?: readonly { label: string; value: string }[] | null;
  /** "2 expenses waiting to sync · −₱1,370" — already out of the drawer, not yet on the server. */
  pendingLine?: string | null;
  /** Opens the expense sheet locked to this drawer. Absent = no expenses in this store yet. */
  onPayExpense?: () => void;
  /** Pay-outs from this drawer the store did not take, with Try again / Remove. */
  refusedPayouts?: readonly RefusedPayout[];
  onRetryRefused?: (id: string) => Promise<void>;
  onRemoveRefused?: (id: string) => Promise<void>;
  /** Opens this shift's sales report. Defaults to the Shift sales screen. */
  onShiftSales?: () => void;
  /**
   * Blind count (owner's rule): the expected figure and the cash-sales line
   * are hidden until the cashier has counted. The moves they recorded stay.
   */
  isBlind?: boolean;
  /** "This shift counts toward Friday, Oct 24 · business day ends 4:00 AM". */
  businessDayNote?: string | null;
}

export const BLIND_AMOUNT = "Hidden · blind count";
export const BLIND_LINE = "Your owner hides the expected cash until you count.";
export const BLIND_HANDOVER = "Count everything at close. We'll tell you the result after.";

/** How many moves the card lists before it stops. */
const MOVES_SHOWN = 3;

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/**
 * The drawer in my hands: which till, what it should hold right now and how
 * that number was reached, and the two things I can do with it.
 *
 * The expected figure is the headline because it is what the count at close
 * is judged against; every line under it is a term of that sum, in the order
 * money moved: float in, sales in, moves in and out.
 */
export function MyShiftCard({
  shift,
  expectation,
  moves,
  activityLine,
  nowMs,
  onCashMove,
  onEndShift,
  payoutLines,
  pendingLine,
  onPayExpense,
  refusedPayouts,
  onRetryRefused,
  onRemoveRefused,
  onShiftSales,
  isBlind = false,
  businessDayNote = null,
}: MyShiftCardProps) {
  const openShiftSales = onShiftSales ?? (() => router.push(shiftSalesHref(shift.id) as never));
  const ready = expectation.state === "ready" ? expectation.value : null;
  const lines: { label: string; value: string }[] = ready
    ? [
        { label: shift.isZeroBalance ? "Starting cash (zero balance)" : "Starting cash", value: formatPeso(shift.openingFloat) },
        // Blind: cash sales would give the expected figure away; the cashier's own moves stay.
        ...(isBlind ? [] : [{ label: "My cash sales", value: `+${formatPeso(ready.summary.cashTotal)}` }]),
        ...(ready.moves.payIn > 0 ? [{ label: "Paid in", value: `+${formatPeso(ready.moves.payIn)}` }] : []),
        ...(payoutLines
          ? payoutLines
          : ready.moves.payOut > 0
            ? [{ label: "Paid out", value: `−${formatPeso(ready.moves.payOut)}` }]
            : []),
        ...(ready.moves.collected > 0 ? [{ label: "Collected", value: `−${formatPeso(ready.moves.collected)}` }] : []),
      ]
    : [];
  const recent = moves.slice(-MOVES_SHOWN).reverse();

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.drawerChip}>
          <Icon name="drawer" size={14} color={colors.heroInkText} />
          <Text style={styles.drawerChipText} numberOfLines={1}>
            {shift.drawerName ?? "My drawer"}
          </Text>
        </View>
        {shift.isZeroBalance ? (
          <View style={styles.zeroBadge}>
            <Text style={styles.zeroBadgeText}>Zero balance</Text>
          </View>
        ) : null}
        <View style={styles.flex} />
        <View style={styles.live} />
        <Text style={styles.since}>
          {clock(shift.openedAt)} · {formatShiftElapsed(nowMs - Date.parse(shift.openedAt))}
        </Text>
      </View>

      <Text style={styles.eyebrow}>Should be in your drawer</Text>
      {isBlind ? (
        <View testID="my-shift-blind">
          <Text style={styles.blindAmount}>{BLIND_AMOUNT}</Text>
          <Text style={styles.handoverMeta}>{BLIND_LINE}</Text>
        </View>
      ) : ready ? (
        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={`Should be in your drawer: ${formatPeso(ready.reconciliation.expectedInDrawer)}`}>
          {formatPeso(ready.reconciliation.expectedInDrawer)}
        </Text>
      ) : (
        <Text style={expectation.state === "unavailable" ? styles.warning : styles.loading}>
          {expectation.state === "unavailable" ? expectation.reason : "Adding up your sales…"}
        </Text>
      )}

      {lines.length > 0 ? (
        <View style={styles.lines}>
          {lines.map((line) => (
            <View key={line.label} style={styles.line}>
              <Text style={styles.lineLabel}>{line.label}</Text>
              <Text style={styles.lineValue}>{line.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {isBlind ? (
        <View style={styles.handover}>
          <Text style={styles.handoverText}>{BLIND_HANDOVER}</Text>
        </View>
      ) : ready ? (
        <View style={styles.handover}>
          <Text style={styles.handoverText}>
            {shift.isZeroBalance
              ? `At close, hand over everything — ${formatPeso(ready.reconciliation.expectedTurnover)}.`
              : `At close, hand over ${formatPeso(ready.reconciliation.expectedTurnover)} and keep ${formatPeso(
                  ready.reconciliation.floatToKeep,
                )} for the next shift.`}
          </Text>
          {ready.summary.nonCashTotal > 0 ? (
            <Text style={styles.handoverMeta}>
              {formatPeso(ready.summary.nonCashTotal)} in GCash, card and other non-cash — not in the drawer.
            </Text>
          ) : null}
        </View>
      ) : null}

      {pendingLine ? <Text style={styles.pending}>{pendingLine}</Text> : null}
      {refusedPayouts && onRetryRefused && onRemoveRefused ? (
        <RefusedPayouts payouts={refusedPayouts} onRetry={onRetryRefused} onRemove={onRemoveRefused} />
      ) : null}
      {activityLine ? <Text style={styles.activity}>{activityLine}</Text> : null}

      {recent.length > 0 ? (
        <View style={styles.moves}>
          {recent.map((move) => {
            const copy = CASH_MOVE_COPY[move.kind];
            return (
              <View key={move.id} style={styles.move}>
                <Text style={styles.moveText} numberOfLines={1}>
                  {copy.label}
                  {move.reason ? ` · ${move.reason}` : ""} · {move.recordedByName}, {clock(move.createdAt)}
                </Text>
                <Text style={[styles.moveAmount, copy.sign < 0 && styles.moveOut]}>
                  {copy.sign < 0 ? "−" : "+"}
                  {formatPeso(move.amount)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {onPayExpense ? (
        <Button
          label="Pay an expense"
          tone="secondary"
          icon="receipt"
          onPress={onPayExpense}
          fullWidth
          style={styles.payExpense}
          accessibilityHint="Pay for ice, LPG or a rider from this drawer and save it as an expense"
        />
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Cash in / out"
          tone="secondary"
          icon="payments"
          size="lg"
          fullWidth={false}
          onPress={onCashMove}
          style={styles.flex}
          accessibilityHint="Add cash, take cash out or record a pickup"
        />
        <Button
          label="Shift sales"
          tone="secondary"
          icon="report"
          size="lg"
          fullWidth={false}
          onPress={openShiftSales}
          style={styles.flex}
          accessibilityHint="Receipts, net sales and how they were paid in this shift"
          testID="my-shift-sales"
        />
      </View>
      <Button
        label="End shift & remit"
        size="lg"
        fullWidth
        onPress={onEndShift}
        style={styles.endShift}
        accessibilityHint="Count the drawer, then hand the cash over"
        testID="my-shift-end"
      />
      {businessDayNote ? <Text style={styles.businessDay}>{businessDayNote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.md,
    ...shadow.md,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  drawerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.heroInkElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: "55%",
  },
  drawerChipText: { ...typography.caption, fontWeight: "800", color: colors.heroInkText },
  zeroBadge: { backgroundColor: colors.accent, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  zeroBadgeText: { ...typography.small, fontWeight: "800", color: colors.textOnDark },
  live: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.success },
  since: { ...typography.caption, color: colors.heroInkMuted },
  eyebrow: { ...typography.eyebrow, color: colors.heroInkMuted, marginTop: spacing.sm },
  amount: { fontSize: 40, fontWeight: "800", color: colors.heroInkText },
  loading: { ...typography.body, color: colors.heroInkMuted },
  warning: { ...typography.caption, color: colors.accentLight, fontWeight: "600" },
  lines: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.heroInkElevated,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  line: { flexDirection: "row", justifyContent: "space-between" },
  lineLabel: { ...typography.caption, color: colors.heroInkMuted },
  lineValue: { ...typography.caption, fontWeight: "700", color: colors.heroInkText },
  handover: { backgroundColor: colors.heroInkElevated, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  handoverText: { ...typography.caption, fontWeight: "700", color: colors.heroInkText },
  handoverMeta: { ...typography.small, color: colors.heroInkMuted },
  activity: { ...typography.small, color: colors.heroInkMuted },
  pending: { ...typography.small, fontWeight: "700", color: colors.heroInkText },
  payExpense: { marginTop: spacing.sm },
  blindAmount: { ...typography.heading, fontWeight: "800", color: colors.heroInkText },
  businessDay: { ...typography.small, color: colors.heroInkMuted, textAlign: "center" },
  moves: { gap: 6 },
  move: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  moveText: { ...typography.small, color: colors.heroInkMuted, flex: 1 },
  moveAmount: { ...typography.small, fontWeight: "800", color: colors.heroInkText },
  moveOut: { color: colors.accentLight },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  // The card is ink; an ink primary button would vanish into it.
  endShift: { backgroundColor: colors.accent },
});

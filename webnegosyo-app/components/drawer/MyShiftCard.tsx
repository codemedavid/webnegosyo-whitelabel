import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { CASH_MOVE_COPY, type CashMove } from "../../lib/cash-drawers";
import type { DrawerExpectationRead } from "../../lib/drawer-expectation";
import { formatPeso } from "../../lib/format";
import { formatShiftElapsed } from "../../lib/shift-status";
import type { ShiftRecord } from "../../lib/shift-service";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";

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
}

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
export function MyShiftCard({ shift, expectation, moves, activityLine, nowMs, onCashMove, onEndShift }: MyShiftCardProps) {
  const ready = expectation.state === "ready" ? expectation.value : null;
  const lines: { label: string; value: string }[] = ready
    ? [
        { label: shift.isZeroBalance ? "Starting cash (zero balance)" : "Starting cash", value: formatPeso(shift.openingFloat) },
        { label: "My cash sales", value: `+${formatPeso(ready.summary.cashTotal)}` },
        ...(ready.moves.payIn > 0 ? [{ label: "Paid in", value: `+${formatPeso(ready.moves.payIn)}` }] : []),
        ...(ready.moves.payOut > 0 ? [{ label: "Paid out", value: `−${formatPeso(ready.moves.payOut)}` }] : []),
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
      {ready ? (
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

      {ready ? (
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

      <View style={styles.actions}>
        <Button
          label="Cash in / out"
          tone="secondary"
          icon="payments"
          onPress={onCashMove}
          style={styles.flex}
          accessibilityHint="Record a pay in, pay out or a cash drop"
        />
        <Button label="End shift" onPress={onEndShift} style={styles.endShift} accessibilityHint="Count the drawer and close your shift" />
      </View>
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
  moves: { gap: 6 },
  move: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  moveText: { ...typography.small, color: colors.heroInkMuted, flex: 1 },
  moveAmount: { ...typography.small, fontWeight: "800", color: colors.heroInkText },
  moveOut: { color: colors.accentLight },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  // The card is ink; an ink primary button would vanish into it.
  endShift: { flex: 1, backgroundColor: colors.accent },
});

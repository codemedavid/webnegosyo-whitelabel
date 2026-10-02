import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { CashDrawer } from "../../lib/cash-drawers";
import type { DrawerExpectationRead } from "../../lib/drawer-expectation";
import { formatPeso } from "../../lib/format";
import { formatShiftElapsed } from "../../lib/shift-status";
import type { ShiftRecord } from "../../lib/shift-service";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { SectionHeader } from "../SectionHeader";
import { StaffAvatar } from "../staff/StaffAvatar";

export interface FloorRow {
  shift: ShiftRecord;
  expectation: DrawerExpectationRead;
  isMine: boolean;
}

interface DrawersOverviewProps {
  rows: readonly FloorRow[];
  /** Tills nobody holds right now. */
  freeDrawers: readonly CashDrawer[];
  nowMs: number;
  onCollect: (row: FloorRow) => void;
  onCount: (row: FloorRow) => void;
  onManage: () => void;
}

/**
 * The owner's floor: every open drawer in this branch, who holds it, and the
 * cash it should hold right now — with the two things an owner does to a
 * cashier's drawer: collect cash from it, or count it and close the shift.
 *
 * Ordered by cash held, most first: the drawer worth a pickup is the one at
 * the top.
 */
export function DrawersOverview({ rows, freeDrawers, nowMs, onCollect, onCount, onManage }: DrawersOverviewProps) {
  const others = [...rows.filter((row) => !row.isMine)].sort((a, b) => held(b) - held(a));
  const total = rows.reduce((sum, row) => sum + held(row), 0);
  const collected = rows.reduce(
    (sum, row) => sum + (row.expectation.state === "ready" ? row.expectation.value.moves.collected : 0),
    0,
  );

  return (
    <View style={styles.wrap}>
      <SectionHeader
        title="All drawers"
        hint={
          rows.length === 0
            ? "Nobody is on a drawer right now"
            : `${formatPeso(total)} in ${rows.length} open drawer${rows.length === 1 ? "" : "s"}${
                collected > 0 ? ` · ${formatPeso(collected)} collected` : ""
              }`
        }
        actionLabel="Manage"
        onAction={onManage}
      />

      {others.length === 0 && freeDrawers.length === 0 ? (
        <Text style={styles.empty}>No other cashier is on shift.</Text>
      ) : null}

      <View style={styles.list}>
        {others.map((row) => {
          const ready = row.expectation.state === "ready" ? row.expectation.value : null;
          return (
            <View key={row.shift.id} style={styles.card}>
              <View style={styles.head}>
                <StaffAvatar name={row.shift.staffName} seed={row.shift.staffUserId ?? undefined} size="md" />
                <View style={styles.headCopy}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.shift.staffName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {row.shift.drawerName ?? "Personal drawer"}
                    {row.shift.isZeroBalance ? " · Zero balance" : ""} · on{" "}
                    {formatShiftElapsed(nowMs - Date.parse(row.shift.openedAt))}
                  </Text>
                </View>
                <View style={styles.figure}>
                  <Text style={styles.figureValue}>{ready ? formatPeso(ready.reconciliation.expectedInDrawer) : "—"}</Text>
                  <Text style={styles.figureLabel}>in drawer</Text>
                </View>
              </View>
              {row.expectation.state === "unavailable" ? (
                <Text style={styles.warning}>{row.expectation.reason}</Text>
              ) : ready && ready.moves.collected > 0 ? (
                <Text style={styles.meta}>
                  {formatPeso(ready.moves.collected)} already collected this shift
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button
                  label="Collect cash"
                  size="sm"
                  tone="secondary"
                  icon="payments"
                  onPress={() => onCollect(row)}
                  style={styles.flex}
                  accessibilityLabel={`Collect cash from ${row.shift.staffName}`}
                />
                <Button
                  label="Count & close"
                  size="sm"
                  tone="ghost"
                  onPress={() => onCount(row)}
                  style={styles.flex}
                  accessibilityLabel={`Count and close ${row.shift.staffName}'s drawer`}
                />
              </View>
            </View>
          );
        })}

        {freeDrawers.map((drawer) => (
          <View key={drawer.id} style={styles.free}>
            <View style={styles.freeDot} />
            <Text style={styles.freeName} numberOfLines={1}>
              {drawer.name}
            </Text>
            <Text style={styles.meta}>Free{drawer.isZeroBalance ? " · Zero balance" : ""}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function held(row: FloorRow): number {
  return row.expectation.state === "ready" ? row.expectation.value.reconciliation.expectedInDrawer : 0;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  list: { gap: spacing.sm },
  empty: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.xs },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headCopy: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  warning: { ...typography.caption, color: colors.danger },
  figure: { alignItems: "flex-end" },
  figureValue: { ...typography.heading, color: colors.textPrimary },
  figureLabel: { ...typography.small, color: colors.textTertiary },
  actions: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  free: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  freeDot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.textTertiary },
  freeName: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, flex: 1 },
});

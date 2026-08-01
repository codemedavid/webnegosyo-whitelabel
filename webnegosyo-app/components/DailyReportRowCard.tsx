/**
 * One ingredient's day, on the phone.
 *
 * The list is ranked worst-first by the money missing, so the card leads with
 * that figure rather than with the quantity — a merchant deciding what to chase
 * before service is deciding in pesos. The flow beneath it is the identity the
 * report reconciles: opening + received − sold − waste + transferred ± count
 * = closing.
 *
 * Every figure is formatted by the shared view module. Hand-rolling the money
 * here is how the phone and the web start disagreeing about the same day.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { formatPeso, formatQuantity } from "../lib/daily-report/daily-report-view";
import type { DailyReportRow } from "../lib/daily-report/daily-report";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";

interface Props {
  row: DailyReportRow;
}

/**
 * Reads the row out as one sentence. An uncounted ingredient is named as such
 * rather than left to be inferred from a zero, because a zero shrinkage and an
 * unchecked shelf look identical and only one of them is good news.
 */
function describeRow(row: DailyReportRow): string {
  const unit = row.stockUnitAbbreviation;
  const parts = [
    `${row.name}.`,
    `Used ${formatQuantity(row.sold, unit)}, costing ${formatPeso(row.cogs)}.`,
    row.waste > 0 ? `Wasted ${formatQuantity(row.waste, unit)}.` : "",
    // Named for a screen reader too — otherwise the closing balance moves with
    // nothing in the spoken sentence to account for it.
    row.transferred !== 0
      ? `${row.transferred < 0 ? "Sent" : "Received"} ${formatQuantity(
          Math.abs(row.transferred),
          unit,
        )} ${row.transferred < 0 ? "to" : "from"} another branch.`
      : "",
    row.wasCounted
      ? row.shrinkage > 0
        ? `Counted short by ${formatQuantity(row.shrinkage, unit)}, worth ${formatPeso(
            row.shrinkageCost,
          )}.`
        : "Counted, and it matched."
      : "Not counted today.",
  ];

  return parts.filter(Boolean).join(" ");
}

export function DailyReportRowCard({ row }: Props) {
  const unit = row.stockUnitAbbreviation;
  const isShort = row.shrinkage > 0;

  return (
    <View style={styles.card} accessible accessibilityLabel={describeRow(row)}>
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={1}>
          {row.name}
        </Text>
        {isShort ? (
          <Text style={styles.shortMoney}>−{formatPeso(row.shrinkageCost)}</Text>
        ) : (
          <Text style={styles.usedMoney}>{formatPeso(row.cogs)}</Text>
        )}
      </View>

      <Text style={styles.caption}>{isShort ? "Missing" : "Used"}</Text>

      {/*
        The reconciliation, spelled out. Closing is the shelf figure the
        merchant can walk over and check, which is what makes the rest of the
        line worth reading.
      */}
      <View style={styles.flow}>
        <Figure label="Opened" value={formatQuantity(row.opening, unit)} />
        <Figure label="In" value={formatQuantity(row.received, unit)} />
        <Figure label="Used" value={formatQuantity(row.sold, unit)} />
        <Figure label="Closed" value={formatQuantity(row.closing, unit)} />
      </View>

      <View style={styles.tags}>
        {row.waste > 0 && (
          <Text style={[styles.tag, styles.tagWaste]}>
            Waste {formatQuantity(row.waste, unit)} · {formatPeso(row.wasteCost)}
          </Text>
        )}
        {/*
          Only when it happened. A transfer is neither usage nor a loss, so it
          gets no figure in the flow above — but it moves the closing balance,
          and an unexplained gap on a stock report invites exactly the wrong
          conclusion.
        */}
        {row.transferred !== 0 && (
          <Text style={[styles.tag, styles.tagTransfer]}>
            {row.transferred < 0 ? "Sent out" : "Received in"}{" "}
            {formatQuantity(Math.abs(row.transferred), unit)}
          </Text>
        )}
        {!row.wasCounted && <Text style={[styles.tag, styles.tagUncounted]}>Not counted</Text>}
        {row.wasCounted && !isShort && (
          <Text style={[styles.tag, styles.tagMatched]}>Counted · matched</Text>
        )}
      </View>
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.sm,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { flex: 1, ...typography.body, fontWeight: "700", color: colors.textPrimary },
  shortMoney: { fontSize: 18, fontWeight: "800", color: colors.danger },
  usedMoney: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  caption: { ...typography.small, color: colors.textTertiary, marginTop: -spacing.sm },

  flow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  figure: { flex: 1 },
  figureLabel: { ...typography.small, color: colors.textTertiary },
  figureValue: { ...typography.caption, fontWeight: "600", color: colors.textSecondary },

  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tag: {
    ...typography.small,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  tagWaste: { backgroundColor: colors.warningLight, color: colors.warning },
  tagTransfer: { backgroundColor: colors.surfaceSubtle, color: colors.textSecondary },
  tagUncounted: { backgroundColor: colors.surfaceSubtle, color: colors.textSecondary },
  tagMatched: { backgroundColor: colors.successLight, color: colors.success },
});

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { PRIME_COST_BAND, type ProfitReport } from "../../lib/profit/profit-model";
import type { TrendBar } from "../../lib/profit/profit-service";
import {
  CASH_OUT_LABELS,
  formatMoney,
  formatRatio,
  ingredientBasisLine,
  ingredientDetail,
  moneyBars,
  notInProfitLine,
  profitVerdict,
  type FindingRow,
} from "../../lib/profit/profit-view";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

// ── The sentence card ─────────────────────────────────────────────────────

function Line({ sign, label, cents, detail }: { sign: string; label: string; cents: number; detail?: string }) {
  return (
    <View style={styles.lineWrap} accessible accessibilityLabel={`${sign === "−" ? "minus " : ""}${label}: ${formatMoney(cents)}`}>
      <View style={styles.line}>
        <Text style={styles.lineLabel}>
          {sign ? <Text style={styles.sign}>{sign} </Text> : null}
          {label}
        </Text>
        <Text style={[styles.lineValue, TABULAR]}>{formatMoney(cents)}</Text>
      </View>
      {detail ? <Text style={styles.lineDetail}>{detail}</Text> : null}
    </View>
  );
}

/** Sales − Ingredients − Expenses = Profit, in one card (plan §5.3). One hero number: profit. */
export function ProfitSentenceCard({
  report,
  caption,
  isInfoOpen,
  onToggleInfo,
}: {
  report: ProfitReport;
  caption: string;
  isInfoOpen: boolean;
  onToggleInfo: () => void;
}) {
  const verdict = profitVerdict(report);
  const notInProfit = notInProfitLine(report);
  const tint = verdict.isLoss ? colors.danger : colors.success;
  return (
    <View style={styles.card}>
      <Text style={styles.caption}>{caption}</Text>
      <Line sign="" label="Sales (Benta)" cents={report.netSalesCents} />
      <View>
        <Line sign="−" label="Ingredients (Sangkap)" cents={report.ingredientCostCents} detail={ingredientDetail(report)} />
        <TouchableOpacity
          onPress={onToggleInfo}
          style={styles.infoButton}
          accessibilityRole="button"
          accessibilityState={{ expanded: isInfoOpen }}
          accessibilityLabel="How ingredients are worked out"
        >
          <Icon name="info" size={14} color={colors.textMuted} />
          <Text style={styles.infoText}>How this is worked out</Text>
        </TouchableOpacity>
        {isInfoOpen ? <Text style={styles.infoBody}>{ingredientBasisLine(report)}</Text> : null}
      </View>
      <Line sign="−" label="Expenses (Gastos)" cents={report.expensesCents} />
      <View style={styles.totalRow} accessible accessibilityLabel={verdict.spoken}>
        <Text style={styles.totalLabel}>
          <Text style={styles.sign}>= </Text>Profit (Kita)
        </Text>
        <Text style={[styles.totalValue, TABULAR, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(report.profitCents)}
        </Text>
      </View>
      <View style={styles.verdict}>
        <Icon name={verdict.isLoss ? "warning" : "check"} size={15} color={tint} />
        <Text style={[styles.verdictText, { color: tint }]}>{verdict.text}</Text>
      </View>
      {notInProfit ? <Text style={styles.note}>{notInProfit}</Text> : null}
    </View>
  );
}

// ── Trust strip ───────────────────────────────────────────────────────────

export function TrustStrip({ rows, onAction }: { rows: readonly FindingRow[]; onAction: (row: FindingRow) => void }) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.strip}>
      {rows.map((row) => (
        <View key={row.key} style={[styles.finding, row.tone === "warning" ? styles.findingWarn : styles.findingInfo]}>
          <Icon name={row.tone === "warning" ? "warning" : "info"} size={16} color={row.tone === "warning" ? colors.statusPending.text : colors.info} />
          <Text style={[styles.findingText, row.tone === "warning" && styles.findingTextWarn]}>{row.text}</Text>
          {row.action ? (
            <TouchableOpacity
              onPress={() => onAction(row)}
              style={styles.findingAction}
              accessibilityRole="button"
              accessibilityLabel={row.action.label}
              accessibilityHint={row.text}
            >
              <Text style={styles.findingActionText}>{row.action.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ── Prime cost ────────────────────────────────────────────────────────────

export function PrimeCostBar({ report }: { report: ProfitReport }) {
  const prime = report.ratios.prime;
  if (prime === null) return null;
  const fill = Math.min(Math.max(prime, 0), 1) * 100;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Ingredients + Staff = {formatRatio(prime)} of sales</Text>
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Ingredients and staff: ${formatRatio(prime)} of sales. Most food businesses land at 55 to 65 percent.`}
      >
        <View style={[styles.band, { left: `${PRIME_COST_BAND.low * 100}%`, width: `${(PRIME_COST_BAND.high - PRIME_COST_BAND.low) * 100}%` }]} />
        <View style={[styles.fill, { width: `${fill}%` }]} />
      </View>
      <Text style={styles.hint}>Most cafés and restaurants land at 55–65%; above that, profit gets thin.</Text>
    </View>
  );
}

// ── Where the money went ──────────────────────────────────────────────────

export function MoneyWent({ report, onOpen }: { report: ProfitReport; onOpen: (categoryId: string) => void }) {
  const { bars, restCents, restCount } = moneyBars(report);
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((bar) => bar.cents), restCents, 1);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Where the money went</Text>
      {bars.map((bar) => (
        <TouchableOpacity
          key={bar.categoryId}
          style={styles.bar}
          onPress={() => onOpen(bar.categoryId)}
          accessibilityRole="button"
          accessibilityLabel={`${bar.name}, ${formatMoney(bar.cents)}. Show these expenses`}
        >
          <Text style={styles.barLabel} numberOfLines={1}>
            {bar.name}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(bar.cents / max) * 100}%` }]} />
          </View>
          <Text style={[styles.barValue, TABULAR]}>{formatMoney(bar.cents)}</Text>
        </TouchableOpacity>
      ))}
      {restCount > 0 ? (
        <View style={styles.bar} accessible accessibilityLabel={`${restCount} other categories, ${formatMoney(restCents)}`}>
          <Text style={styles.barLabel}>Other {restCount}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, styles.barFillRest, { width: `${(restCents / max) * 100}%` }]} />
          </View>
          <Text style={[styles.barValue, TABULAR]}>{formatMoney(restCents)}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Trend ─────────────────────────────────────────────────────────────────

const TREND_HEIGHT = 96;

export function ProfitTrend({ bars }: { bars: readonly TrendBar[] }) {
  if (bars.length < 2) return null;
  const max = Math.max(1, ...bars.map((bar) => Math.abs(bar.profitCents)));
  const hasLoss = bars.some((bar) => bar.profitCents < 0);
  const half = hasLoss ? TREND_HEIGHT / 2 : TREND_HEIGHT;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Profit over time</Text>
      <View style={[styles.trend, { height: TREND_HEIGHT + 16 }]}>
        {bars.map((bar) => {
          const isLoss = bar.profitCents < 0;
          const height = Math.max(2, (Math.abs(bar.profitCents) / max) * half);
          return (
            <View
              key={bar.key}
              style={styles.trendColumn}
              accessible
              accessibilityLabel={`${bar.label}: ${isLoss ? "loss" : "profit"} ${formatMoney(Math.abs(bar.profitCents))}${bar.isIncomplete ? ", so far" : ""}`}
            >
              <View style={[styles.trendTop, { height: half }]}>
                {!isLoss ? <View style={[styles.trendBar, { height }, bar.isIncomplete && styles.trendOpen]} /> : null}
              </View>
              {hasLoss ? (
                <View style={[styles.trendBottom, { height: half }]}>
                  {isLoss ? <View style={[styles.trendBar, styles.trendLoss, { height }, bar.isIncomplete && styles.trendOpen]} /> : null}
                </View>
              ) : null}
              <Text style={styles.trendLabel} numberOfLines={1}>
                {bar.label}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.hint}>The last bar is still running when the period is.</Text>
    </View>
  );
}

// ── Cash flow ─────────────────────────────────────────────────────────────

export function CashFlowCard({ report, onSort }: { report: ProfitReport; onSort: () => void }) {
  const { cashFlow } = report;
  const out = cashFlow.out.filter((line) => line.cents !== 0);
  const tint = cashFlow.netCents < 0 ? colors.danger : colors.textPrimary;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Cash flow</Text>
      <Text style={styles.hint}>What came in and what went out — stock purchases, big purchases and owner draws included.</Text>
      <Line sign="" label="Cash in (collected)" cents={cashFlow.inCents} />
      {out.map((line) => (
        <Line key={line.key} sign="−" label={CASH_OUT_LABELS[line.key]} cents={line.cents} />
      ))}
      <View style={styles.totalRow} accessible accessibilityLabel={`Net cash ${cashFlow.netCents < 0 ? "out" : "in"}: ${formatMoney(Math.abs(cashFlow.netCents))}`}>
        <Text style={styles.totalLabel}>
          <Text style={styles.sign}>= </Text>Net cash
        </Text>
        <Text style={[styles.cashNet, TABULAR, { color: tint }]}>{formatMoney(cashFlow.netCents)}</Text>
      </View>
      {cashFlow.unsortedPayouts > 0 ? (
        <TouchableOpacity style={styles.finding} onPress={onSort} accessibilityRole="button">
          <Icon name="drawer" size={16} color={colors.textMuted} />
          <Text style={styles.findingText}>
            Not counted above: {cashFlow.unsortedPayouts} drawer {cashFlow.unsortedPayouts === 1 ? "pay-out" : "pay-outs"} (
            {formatMoney(cashFlow.unsortedPayoutCents)}) still to sort.
          </Text>
          <Text style={styles.findingActionText}>Sort</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  caption: { ...typography.caption, color: colors.textMuted },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textMuted },
  lineWrap: { gap: 2 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.md },
  lineLabel: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  sign: { color: colors.textMuted, fontWeight: "700" },
  lineValue: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  lineDetail: { ...typography.small, color: colors.textMuted },
  infoButton: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, alignSelf: "flex-start" },
  infoText: { ...typography.small, fontWeight: "700", color: colors.textMuted },
  infoBody: { ...typography.caption, color: colors.textSecondary, backgroundColor: colors.surfaceSubtle, padding: spacing.sm, borderRadius: radius.sm },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  totalLabel: { ...typography.heading, color: colors.textPrimary },
  totalValue: { fontSize: 34, fontWeight: "800", letterSpacing: -0.5, flexShrink: 1 },
  cashNet: { fontSize: 24, fontWeight: "800" },
  verdict: { flexDirection: "row", alignItems: "center", gap: 6 },
  verdictText: { ...typography.caption, fontWeight: "700" },
  note: { ...typography.caption, color: colors.textMuted },

  strip: { gap: spacing.sm },
  finding: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  findingWarn: { backgroundColor: colors.statusPending.bg, borderColor: colors.statusPending.bg },
  findingInfo: { backgroundColor: colors.infoLight, borderColor: colors.infoLight },
  findingText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  findingTextWarn: { color: colors.statusPending.text, fontWeight: "600" },
  findingAction: { minHeight: 40, minWidth: 56, justifyContent: "center", alignItems: "flex-end" },
  findingActionText: { ...typography.caption, fontWeight: "800", color: colors.textPrimary, textDecorationLine: "underline" },

  track: { height: 12, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle, overflow: "hidden", justifyContent: "center" },
  band: { position: "absolute", top: 0, bottom: 0, backgroundColor: colors.successLight },
  fill: { position: "absolute", left: 0, top: 3, bottom: 3, borderRadius: radius.full, backgroundColor: colors.primary },

  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 36 },
  barLabel: { ...typography.caption, color: colors.textPrimary, width: 92 },
  barTrack: { flex: 1, height: 10, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle, overflow: "hidden" },
  barFill: { height: 10, borderRadius: radius.full, backgroundColor: colors.primary },
  barFillRest: { backgroundColor: colors.textTertiary },
  barValue: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, width: 76, textAlign: "right" },

  trend: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  trendColumn: { flex: 1, alignItems: "center" },
  trendTop: { justifyContent: "flex-end", alignSelf: "stretch", alignItems: "center" },
  trendBottom: { justifyContent: "flex-start", alignSelf: "stretch", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.separator },
  trendBar: { width: "70%", borderRadius: 4, backgroundColor: colors.success },
  trendLoss: { backgroundColor: colors.danger },
  trendOpen: { opacity: 0.45 },
  trendLabel: { ...typography.small, color: colors.textMuted, marginTop: 4 },
});

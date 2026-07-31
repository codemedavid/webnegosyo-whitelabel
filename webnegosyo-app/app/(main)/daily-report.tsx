import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";

import { useAuthStore } from "../../stores/auth-store";
import { loadDailyReport, countDishesWithRecipe } from "../../lib/daily-report-service";
import type { DailyReportForDay } from "../../lib/daily-report-service";
import {
  resolveReportDay,
  previousBusinessDayKey,
  nextBusinessDayKey,
} from "../../lib/daily-report/business-day";
import {
  formatPeso,
  formatBusinessDayLabel,
  describeReportCaveats,
} from "../../lib/daily-report/daily-report-view";
import { judgeVariance, type VarianceLevel } from "../../lib/daily-report/variance-verdict";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { DailyReportRowCard } from "../../components/DailyReportRowCard";

/**
 * The merchant app's daily inventory report.
 *
 * Answers one question the merchant asks standing at the shelf before service:
 * did yesterday's stock go where the orders say it went, and what did the gap
 * cost? It is the same reconciliation the web admin shows, from the same
 * parity-guarded core in lib/daily-report/ — this screen only arranges it.
 *
 * Deliberately carries NO revenue and no food-cost percentage. That figure
 * needs the tenant's order backend, which on the web routes through
 * `resolveOrderBackend` and, for some tenants, a Convex client. The verdict was
 * built to need no revenue at all, so the phone gets an honest subset rather
 * than a half-ported backend router — and the web keeps the percentage.
 */

/** The banner tint per grade, plus the one for a day that cannot be graded. */
const VERDICT_TONE: Record<VarianceLevel | "unknown", { bg: string; fg: string }> = {
  good: { bg: colors.successLight, fg: colors.success },
  watch: { bg: colors.warningLight, fg: colors.warning },
  investigate: { bg: colors.dangerLight, fg: colors.danger },
  unknown: { bg: colors.surfaceSubtle, fg: colors.textSecondary },
};

interface VerdictProps {
  level: VarianceLevel | null;
  headline: string;
  detail: string;
}

/**
 * The grade, and its justification, together. They are one statement: a
 * verdict without its reasoning is just a colour.
 */
function DailyReportVerdict({ level, headline, detail }: VerdictProps) {
  const tone = VERDICT_TONE[level ?? "unknown"];

  return (
    <View
      style={[styles.verdict, { backgroundColor: tone.bg }]}
      accessible
      accessibilityLabel={`${headline}. ${detail}`}
    >
      <Text style={[styles.verdictHeadline, { color: tone.fg }]}>{headline}</Text>
      <Text style={styles.verdictDetail}>{detail}</Text>
    </View>
  );
}

export default function DailyReportScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);

  // Resolved once per mount rather than per render: the default day is derived
  // from the clock, and a day that changed underneath the merchant mid-session
  // would silently swap the report they were reading.
  const [selection] = useState(() => resolveReportDay(undefined, new Date().toISOString()));
  const [dayKey, setDayKey] = useState(selection.dayKey);

  const [report, setReport] = useState<DailyReportForDay | null>(null);
  const [dishesWithRecipe, setDishesWithRecipe] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;

    setFailed(false);
    const [loaded, covered] = await Promise.all([
      loadDailyReport(tenantId, dayKey),
      countDishesWithRecipe(tenantId),
    ]);

    // The read returns null rather than an empty report precisely so this can
    // tell a bad connection from a quiet day.
    if (loaded === null) setFailed(true);

    setReport(loaded);
    setDishesWithRecipe(covered);
    setIsLoading(false);
    setRefreshing(false);
  }, [tenantId, dayKey]);

  useEffect(() => {
    setIsLoading(true);
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const verdict = useMemo(() => {
    if (!report || dishesWithRecipe === undefined) return null;
    return judgeVariance({
      cogs: report.totals.cogs,
      shrinkageCost: report.totals.shrinkageCost,
      countedCount: report.countedCount,
      dishesWithRecipe,
    });
  }, [report, dishesWithRecipe]);

  const caveats = useMemo(() => (report ? describeReportCaveats(report) : []), [report]);

  const isLatestDay = dayKey >= selection.latestDayKey;

  const body = () => {
    if (isLoading) return <LoadingState message="Reconciling the day..." />;
    if (failed || !report) {
      return (
        <ErrorState
          message="Could not load this day's report. Pull down to try again."
          onRetry={load}
        />
      );
    }
    if (report.rows.length === 0) {
      return <EmptyState message="No stock moved on this day." />;
    }

    return (
      <>
        {verdict && (
          <DailyReportVerdict
            level={verdict.level}
            headline={verdict.headline}
            detail={verdict.detail}
          />
        )}

        {caveats.map((caveat) => (
          // Above the figures, never below. An uncounted day and a tidy day
          // produce the identical zero; in a footnote this becomes reassuring.
          <Text key={caveat} style={styles.caveat}>
            {caveat}
          </Text>
        ))}

        <View style={styles.totals}>
          <Total label="Stock used" value={formatPeso(report.totals.cogs)} />
          <Total label="Wasted" value={formatPeso(report.totals.wasteCost)} />
          <Total
            label="Missing"
            value={formatPeso(report.totals.shrinkageCost)}
            tint={report.totals.shrinkageCost > 0 ? colors.danger : undefined}
          />
        </View>

        <Text style={styles.listHeading}>Worst first</Text>
        <View style={styles.list}>
          {report.rows.map((row) => (
            <DailyReportRowCard key={row.inventoryItemId} row={row} />
          ))}
        </View>
      </>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerWrap}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Daily Report</Text>
            <Text style={styles.subtitle}>Did the shelf match the orders?</Text>
          </View>
          <WorkspaceSwitcher />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.dayNav}>
          <TouchableOpacity
            style={styles.dayButton}
            onPress={() => setDayKey(previousBusinessDayKey(dayKey))}
            accessibilityRole="button"
            accessibilityLabel="Previous day"
          >
            <Text style={styles.dayButtonText}>‹</Text>
          </TouchableOpacity>

          <Text style={styles.dayLabel}>{formatBusinessDayLabel(dayKey)}</Text>

          <TouchableOpacity
            style={[styles.dayButton, isLatestDay && styles.dayButtonDisabled]}
            onPress={() => setDayKey(nextBusinessDayKey(dayKey))}
            disabled={isLatestDay}
            accessibilityRole="button"
            accessibilityLabel="Next day"
            accessibilityState={{ disabled: isLatestDay }}
          >
            <Text style={styles.dayButtonText}>›</Text>
          </TouchableOpacity>
        </View>

        {body()}
      </ScrollView>
    </View>
  );
}

function Total({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, tint ? { color: tint } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerWrap: {
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerText: { flex: 1 },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: 40 },

  dayNav: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dayButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  dayButtonDisabled: { opacity: 0.35 },
  dayButtonText: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },

  verdict: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  verdictHeadline: { fontSize: 18, fontWeight: "800" },
  verdictDetail: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },

  caveat: {
    ...typography.caption,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
  },

  totals: { flexDirection: "row", gap: spacing.sm },
  total: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
    ...shadow.sm,
  },
  totalLabel: { ...typography.small, color: colors.textTertiary },
  totalValue: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },

  listHeading: { ...typography.eyebrow, color: colors.textTertiary },
  list: { gap: spacing.md },
});

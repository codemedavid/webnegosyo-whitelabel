import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { useTradingDay } from "../../lib/business-day/use-trading-day";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import type { ReportSelection } from "../../lib/report-window";
import { hasPermission } from "../../lib/staff-permissions";
import { cardChoices, cardValues, overviewSections, resolveCards } from "../../lib/sales-report/cards";
import { readCardPrefs, writeCardPrefs } from "../../lib/sales-report/card-prefs";
import { shareRows, whatChanged } from "../../lib/sales-report/overview-view";
import type { CompareTo, MetricDef, MetricId, ReportPayload, ReportPreset, ReportQuery } from "../../lib/sales-report/types";
import { useSalesReport } from "../../lib/sales-report/use-sales-report";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { ReportRangePicker } from "../ReportRangePicker";
import { ScreenHeader } from "../ScreenHeader";
import { KpiGrid } from "./KpiGrid";
import { ChangesCard, ShareListCard } from "./ListCards";
import { EditCardsSheet, MetricInfoSheet } from "./MetricSheets";
import { RangeBar } from "./RangeBar";
import { TrendCard } from "./TrendCard";

const TOP_ITEMS = 5;
const MIX_ROWS = 4;
const ITEMS_ROUTE = "/(main)/product-analytics";
const ORDERS_ROUTE = "/(main)/orders";

type Period = { preset: Exclude<ReportPreset, "custom"> } | { preset: "custom"; from: string; to: string };

function useCardChoice(userId: string | null, tenantId: string | null) {
  const [chosen, setChosen] = useState<MetricId[] | null>(null);
  useEffect(() => {
    let isLive = true;
    setChosen(null);
    if (userId && tenantId) void readCardPrefs(userId, tenantId).then((cards) => isLive && setChosen(cards));
    return () => {
      isLive = false;
    };
  }, [userId, tenantId]);
  const save = useCallback(
    (cards: MetricId[] | null) => {
      setChosen(cards);
      if (userId && tenantId) void writeCardPrefs(userId, tenantId, cards ?? []);
    },
    [userId, tenantId],
  );
  return [chosen, save] as const;
}

function OverviewSkeleton() {
  return (
    <View style={styles.skeleton} accessible accessibilityRole="progressbar" accessibilityLabel="Loading your sales">
      <View style={[styles.block, styles.heroBlock]} />
      <View style={styles.blockRow}>
        <View style={styles.block} />
        <View style={styles.block} />
      </View>
      <View style={[styles.block, { height: 220 }]} />
    </View>
  );
}

interface OverviewBodyProps {
  payload: ReportPayload;
  cards: MetricDef[];
  onOpenMetric: (metric: MetricDef) => void;
  onEditCards: () => void;
}

function OverviewBody({ payload, cards, onOpenMetric, onEditCards }: OverviewBodyProps) {
  const { context, metrics, sections } = payload;
  const values = cardValues(sections.summary, sections.profit);
  const comparePhrase = context.compare?.phrase ?? null;
  const changes = whatChanged(sections, metrics, comparePhrase);
  const items = sections.items?.ok ? sections.items.data.rows : [];
  const orderTypes = sections.order_types?.ok ? sections.order_types.data.rows : [];
  const payments = sections.payments?.ok ? sections.payments.data.rows : [];
  const periods = sections.periods?.ok ? sections.periods.data : null;
  const go = (href: string) => router.push(href as never);

  if (!sections.summary?.ok) {
    return <ErrorState title="Sales couldn’t load" message={sections.summary?.ok === false ? sections.summary.error.message : undefined} />;
  }
  return (
    <>
      <KpiGrid cards={cards} current={values.current} previous={values.previous} comparePhrase={comparePhrase} onOpen={onOpenMetric} onEdit={onEditCards} />
      <ChangesCard lines={changes} onOpen={(target) => go(target === "items" ? ITEMS_ROUTE : ORDERS_ROUTE)} />
      {periods ? (
        <TrendCard rows={periods.rows} metrics={metrics} grain={periods.grain} compareLabel={context.compare?.label ?? null} isPartial={context.period.isPartial} />
      ) : null}
      <ShareListCard
        title="Top items"
        rows={shareRows(items, "net_sales", "money", TOP_ITEMS, (row) => `${row.values.items_sold ?? 0} sold`)}
        emptyText="Nothing sold in this period."
        isRanked
        footerLabel="See every item"
        onFooter={() => go(ITEMS_ROUTE)}
      />
      <ShareListCard title="Order types" rows={shareRows(orderTypes, "net_sales", "money", MIX_ROWS)} emptyText="No orders in this period." />
      <ShareListCard title="Payments" rows={shareRows(payments, "money_received", "money", MIX_ROWS)} emptyText="No money received in this period." />
    </>
  );
}

/**
 * Sales (platform stores): the period's figures the owner chose to track,
 * what changed, sales over time, the top items and the mix — every number
 * from the web's one sales definition (`POST /api/reports/query`). Plan
 * docs/plans/2026-11-05-reports-redesign §6.1, built app first.
 */
export function SalesOverview() {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const { schedule } = useTradingDay();
  const canSeeCosts = hasPermission({ role, isOwner, permissions }, "costs");

  const [period, setPeriod] = useState<Period>({ preset: "this_month" });
  const [compare, setCompare] = useState<CompareTo>("previous");
  const [branch, setBranch] = useState<string | null>(null);
  const [isPickingRange, setIsPickingRange] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [openMetric, setOpenMetric] = useState<MetricDef | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chosen, saveChosen] = useCardChoice(userId, tenantId);

  const query = useMemo<ReportQuery | null>(
    () =>
      tenantId
        ? {
            tenantId,
            period: period.preset === "custom" ? { preset: "custom", from: period.from, to: period.to } : { preset: period.preset },
            compare,
            branch,
            sections: overviewSections(canSeeCosts),
          }
        : null,
    [tenantId, period, compare, branch, canSeeCosts],
  );
  const report = useSalesReport(query);
  const refresh = useCallback(() => refreshWithMinSpinner([report.refetch], setIsRefreshing), [report.refetch]);

  const settled = report.data;
  const payload = settled?.ok ? settled.payload : null;
  const choices = payload ? cardChoices(payload.metrics) : [];
  const cards = payload ? resolveCards(chosen, payload.metrics) : [];
  const values = payload ? cardValues(payload.sections.summary, payload.sections.profit) : null;

  const pickPreset = (preset: ReportPreset) => {
    if (preset === "custom") setIsPickingRange(true);
    else setPeriod({ preset });
  };
  const applyRange = (picked: ReportSelection) => {
    setIsPickingRange(false);
    if (picked.kind === "day") setPeriod({ preset: "custom", from: picked.dayKey, to: picked.dayKey });
    else if (picked.kind === "range") setPeriod({ preset: "custom", from: picked.fromKey, to: picked.toKey });
  };

  const context = payload?.context ?? null;
  const subtitle = context ? `${context.period.label}${context.period.isPartial ? " · so far" : ""}` : "Your sales, at a glance";

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Sales" subtitle={subtitle} />
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}>
        <RangeBar
          preset={period.preset}
          onPickPreset={pickPreset}
          compare={compare}
          onPickCompare={setCompare}
          branches={context?.branchOptions ?? null}
          branch={branch}
          onPickBranch={setBranch}
          lockedBranchLabel={context?.lockedBranchLabel ?? null}
          periodLabel={context && period.preset === "custom" ? context.period.label : null}
        />
        {context?.periodError ? <Text style={styles.notice}>{context.periodError}</Text> : null}
        {report.isLoading && !settled ? <OverviewSkeleton /> : null}
        {report.error && !settled ? <ErrorState title="Sales couldn’t load" message={report.error} onRetry={() => void report.refetch()} /> : null}
        {settled && !settled.ok ? (
          <EmptyState icon={settled.reason === "forbidden" ? "lock" : "info"} title="Sales aren’t available" message={settled.message} inset />
        ) : null}
        {payload ? (
          <OverviewBody payload={payload} cards={cards} onOpenMetric={setOpenMetric} onEditCards={() => setIsEditing(true)} />
        ) : null}
      </ScrollView>

      {isPickingRange ? (
        <ReportRangePicker
          visible
          selection={
            period.preset === "custom"
              ? { kind: "range", fromKey: period.from, toKey: period.to }
              : { kind: "range", fromKey: context?.period.from ?? context?.today ?? "", toKey: context?.period.to ?? context?.today ?? "" }
          }
          nowMs={Date.now()}
          schedule={schedule}
          onApply={applyRange}
          onClose={() => setIsPickingRange(false)}
        />
      ) : null}
      {payload ? (
        <EditCardsSheet
          visible={isEditing}
          chosen={cards.map((card) => card.id)}
          choices={choices}
          onChange={saveChosen}
          onReset={() => saveChosen(null)}
          onClose={() => setIsEditing(false)}
        />
      ) : null}
      <MetricInfoSheet
        metric={openMetric}
        value={openMetric && values ? values.current[openMetric.id] : null}
        previous={openMetric && values?.previous ? values.previous[openMetric.id] : null}
        compareLabel={context?.compare?.label ?? null}
        periodLabel={context?.period.label ?? ""}
        onClose={() => setOpenMetric(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  notice: { ...typography.caption, color: colors.danger },
  skeleton: { gap: spacing.md },
  block: { flex: 1, height: 108, borderRadius: radius.lg, backgroundColor: colors.card },
  heroBlock: { flex: 0, height: 132, backgroundColor: colors.heroInkElevated, opacity: 0.25 },
  blockRow: { flexDirection: "row", gap: spacing.sm },
});

import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import type { FunctionReference } from "convex/server";

import type { ActivityRpcClient } from "../../lib/activity/activity-repo";
import { periodWindow } from "../../lib/activity/filters";
import type { StoreActivityEvent } from "../../lib/activity/store-event";
import { buildSummaryModel, type SummaryStat } from "../../lib/activity/summary-model";
import { buildPeopleRows, type PersonRow } from "../../lib/activity/summary-people";
import type { ActivityCategory } from "../../lib/activity/taxonomy";
import { useActivitySummary } from "../../lib/activity/use-activity-summary";
import { useSafeQuery } from "../../lib/hooks";
import { colors, spacing } from "../../theme/colors";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { SegmentedControl } from "../SegmentedControl";
import { ActivitySkeleton } from "./ActivitySkeleton";
import { SummaryHero } from "./SummaryHero";
import { DrawersSection, FlagsFooter, GivenAwayLine, PeopleSection, SummaryStats } from "./SummarySections";

const getSalesAnalyticsRef = "analytics:getSalesAnalytics" as unknown as FunctionReference<"query">;

type SummaryPeriod = 1 | 7 | 30;
const PERIOD_OPTIONS: readonly { label: string; value: SummaryPeriod }[] = [
  { label: "Today", value: 1 },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
];
const BASELINE_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;

interface SalesSnapshot {
  totalRevenue: number;
}

interface SummaryViewProps {
  tenantId: string | null;
  client: ActivityRpcClient;
  /** Narrowing a store-wide account to one branch; null = the account's whole scope. */
  outletId: string | null;
  isFullViewer: boolean;
  nowIso: string;
  onOpenCategory: (category: ActivityCategory) => void;
  onOpenFlags: () => void;
  onOpenEvent: (event: StoreActivityEvent) => void;
  onOpenPerson: (person: PersonRow) => void;
}

function windowFor(days: SummaryPeriod, nowIso: string): { since: string; until: string; baselineSince: string } {
  // Calendar days in Manila, counting today: Today = since midnight.
  const todayStart = Date.parse(periodWindow("today", null, nowIso).since);
  const since = new Date(todayStart - (days - 1) * DAY_MS).toISOString();
  return { since, until: nowIso, baselineSince: new Date(Date.parse(nowIso) - BASELINE_DAYS * DAY_MS).toISOString() };
}

/**
 * "Did money leak, and is anyone off their normal?" (spec §3.4). The store's
 * view only: a staff member who sees just their own activity has no Summary.
 */
export function SummaryView({
  tenantId,
  client,
  outletId,
  isFullViewer,
  nowIso,
  onOpenCategory,
  onOpenFlags,
  onOpenEvent,
  onOpenPerson,
}: SummaryViewProps) {
  const [days, setDays] = useState<SummaryPeriod>(1);
  // Re-derived only when the period or the minute changes, so the query key is stable.
  const window = useMemo(() => windowFor(days, nowIso), [days, nowIso]);
  const summary = useActivitySummary(tenantId ? { tenantId, outletId, ...window } : null, { client });
  const sales = useSafeQuery<SalesSnapshot>(getSalesAnalyticsRef, tenantId ? { daysBack: days } : "skip");
  const baselineSales = useSafeQuery<SalesSnapshot>(getSalesAnalyticsRef, tenantId ? { daysBack: BASELINE_DAYS } : "skip");

  const { current, baseline, rows, isRowsPartial } = summary;
  const salesTotal = sales.data?.totalRevenue ?? null;
  const baselineSalesTotal = baselineSales.data?.totalRevenue ?? null;
  const model = useMemo(
    () =>
      current
        ? buildSummaryModel({
            current,
            baseline: baseline ?? null,
            rows,
            isRowsPartial,
            sales: salesTotal,
            baselineSales: baselineSalesTotal,
          })
        : null,
    [current, baseline, rows, isRowsPartial, salesTotal, baselineSalesTotal],
  );
  const people = useMemo(
    () => (isFullViewer && current ? buildPeopleRows(current, baseline ?? null) : []),
    [isFullViewer, current, baseline],
  );

  const openStat = (stat: SummaryStat) => onOpenCategory(stat.category);
  const openDrawer = (eventId: string) => {
    const event = summary.rows.find((row) => row.id === eventId);
    if (event) onOpenEvent(event);
  };

  const body = (() => {
    if (summary.isUnavailable) {
      return <EmptyState icon="info" title="Not switched on yet" message="Store activity isn't available for this store yet." />;
    }
    if (summary.isLoading) return <ActivitySkeleton rows={4} />;
    if (!model) {
      return <ErrorState title="Couldn't load the summary" message="Check your connection and try again." onRetry={() => void summary.refetch()} />;
    }
    if (model.isEmpty) return <EmptyState icon="list" title="Nothing recorded yet" message="No sales recorded for this period yet." />;
    return (
      <>
        <SummaryHero model={model} />
        <SummaryStats stats={model.stats} onOpen={openStat} />
        <GivenAwayLine line={model.givenAway} />
        <DrawersSection drawers={model.drawers} onOpen={(row) => openDrawer(row.eventId)} />
        <PeopleSection people={people} onOpen={onOpenPerson} />
        <FlagsFooter count={model.flaggedOpen} onOpen={onOpenFlags} />
      </>
    );
  })();

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void summary.refetch()} tintColor={colors.textMuted} />}
    >
      <View style={styles.period}>
        <SegmentedControl options={PERIOD_OPTIONS} value={days} onChange={setDays} accessibilityPrefix="Summarise" />
      </View>
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 3 },
  period: { marginBottom: spacing.lg },
});

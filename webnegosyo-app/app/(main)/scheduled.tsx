import React, { useState, useMemo, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { FunctionReference } from "convex/server";
import { router } from "expo-router";
import { useSafeQuery } from "../../lib/hooks";
import { filterOrdersToScope } from "../../lib/branch-scope";
import { useBranchScope } from "../../lib/use-branch-scope";
import {
  selectScheduledOrders,
  buildDateStrip,
  ordersForDay,
  groupByTime,
  todayKey,
  type ScheduledSourceOrder,
  type TimeGroup,
} from "../../lib/scheduled-orders";
import {
  agendaDays,
  filterByKind,
  loadByDay,
  monthCursorOf,
  nextLoadedDay,
  shiftMonth,
  type MonthCursor,
  type ScheduleKind,
} from "../../lib/schedule-calendar";
import { hasLiveOrderBackend } from "../../lib/order-backend";
import { useAuthStore } from "../../stores/auth-store";
import { colors, typography, spacing } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
// Rendered by <ScreenHeader>; the import stays so the guardrail that every
// tab is escapable keeps reading it here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { OptionPills } from "../../components/OptionPills";
import { MonthCalendar } from "../../components/schedule/MonthCalendar";
import { DayTimeline } from "../../components/schedule/DayTimeline";
import { type OrderCardOrder } from "../../components/OrderCard";

/**
 * The Schedule tab: every pre-order and scheduled order the store has
 * promised, laid out the way a merchant already thinks about promises —
 * on a calendar.
 *
 * Month view is the overview (which days are loaded, which are pre-sold,
 * whether today slipped); the timeline under it is the day in detail.
 * Agenda view is the same timeline for every upcoming day in one scroll,
 * for the merchant who wants to read the week rather than tap it.
 */
const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

/** Pre-orders sit days out, so read deeper than the queue's default page. */
const SCHEDULED_FETCH_LIMIT = 300;

/** The agenda re-bands as time passes; twice a minute is plenty. */
const TIMER_TICK_MS = 30_000;

type ScheduledScreenOrder = ScheduledSourceOrder & OrderCardOrder;
type ViewMode = "month" | "agenda";

const VIEW_OPTIONS = [
  { label: "Month", value: "month" },
  { label: "Agenda", value: "agenda" },
] as const satisfies readonly { label: string; value: ViewMode }[];

const KIND_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Pre-orders", value: "presell" },
  { label: "Scheduled", value: "plain" },
] as const satisfies readonly { label: string; value: ScheduleKind }[];

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function openOrder(orderId: string) {
  router.push(`/(main)/order/${orderId}`);
}

export default function ScheduledScreen() {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const outletName = useAuthStore((s) => s.outletName);
  const hasBackend = hasLiveOrderBackend({ convexUrl, orderBackend });

  const { data: orders, isLoading, error } = useSafeQuery<ScheduledScreenOrder[]>(getOrdersRef, {
    limit: SCHEDULED_FETCH_LIMIT,
  });
  const scope = useBranchScope();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [kind, setKind] = useState<ScheduleKind>("all");
  const [cursor, setCursor] = useState<MonthCursor | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const allScheduled = useMemo(() => {
    const scoped = filterOrdersToScope(scope, orders) as ScheduledScreenOrder[] | undefined;
    return selectScheduledOrders(scoped);
  }, [scope, orders]);
  const scheduled = useMemo(() => filterByKind(allScheduled, kind), [allScheduled, kind]);
  const presellCount = useMemo(
    () => filterByKind(allScheduled, "presell").length,
    [allScheduled],
  );

  const today = todayKey(nowMs);
  const activeCursor = cursor ?? monthCursorOf(nowMs);
  // A selected day stays selected even once it empties (the merchant may be
  // looking at it on purpose); only a day that has passed snaps back to today.
  const activeKey = selectedKey && selectedKey >= today ? selectedKey : today;

  const load = useMemo(() => loadByDay(scheduled, nowMs), [scheduled, nowMs]);
  const dayGroups = useMemo(
    () => groupByTime(ordersForDay(scheduled, activeKey, nowMs)),
    [scheduled, activeKey, nowMs],
  );
  const agenda = useMemo(
    () =>
      agendaDays(scheduled, nowMs).map((day) => ({
        ...day,
        groups: groupByTime(day.orders),
      })),
    [scheduled, nowMs],
  );
  // The agenda strip is what the guardrail and the "Next:" jump are built on.
  const strip = useMemo(() => buildDateStrip(scheduled, nowMs), [scheduled, nowMs]);
  const hasUpcomingDays = strip.length > 1;

  const jumpToDay = useCallback(
    (key: string) => {
      const [year, month] = key.split("-").map(Number);
      setCursor({ year, month: month - 1 });
      setSelectedKey(key);
    },
    [],
  );
  const jumpToToday = useCallback(() => jumpToDay(today), [jumpToDay, today]);

  const header = (
    <Header
      outletName={outletName}
      count={allScheduled.length}
      presellCount={presellCount}
      viewMode={viewMode}
      onViewMode={setViewMode}
      kind={kind}
      onKind={setKind}
    />
  );

  if (!hasBackend || error) {
    return (
      <View style={styles.screen}>
        {header}
        <ErrorState
          message={error ?? "This store's order backend is not configured yet. Please contact support."}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.screen}>
        {header}
        <LoadingState message="Loading the schedule…" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {viewMode === "month" ? (
          <>
            <MonthCalendar
              cursor={activeCursor}
              nowMs={nowMs}
              load={load}
              selectedKey={activeKey}
              onSelectDay={setSelectedKey}
              onShiftMonth={(delta) => setCursor(shiftMonth(activeCursor, delta))}
              onJumpToday={jumpToToday}
            />
            <View style={styles.day}>
              <DayTimeline
                dayKey={activeKey}
                nowMs={nowMs}
                groups={dayGroups}
                onOpenOrder={openOrder}
                nextKey={nextLoadedDay(load, activeKey)}
                onJumpNext={jumpToDay}
              />
            </View>
          </>
        ) : (
          <AgendaList
            days={agenda}
            nowMs={nowMs}
            hasUpcomingDays={hasUpcomingDays}
            isFiltered={kind !== "all"}
            onClearFilter={() => setKind("all")}
          />
        )}
      </ScrollView>
    </View>
  );
}

interface HeaderProps {
  outletName: string | null;
  count: number;
  presellCount: number;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  kind: ScheduleKind;
  onKind: (kind: ScheduleKind) => void;
}

function Header({ outletName, count, presellCount, viewMode, onViewMode, kind, onKind }: HeaderProps) {
  const parts = [plural(count, "upcoming order")];
  if (presellCount > 0) parts.push(plural(presellCount, "pre-order"));
  if (outletName) parts.push(outletName);
  return (
    <>
      {/* <ScreenHeader> mounts <WorkspaceSwitcher /> */}
      <ScreenHeader title="Schedule" subtitle={parts.join(" · ")}>
        <View style={styles.toolbar}>
          <SegmentedControl
            options={VIEW_OPTIONS}
            value={viewMode}
            onChange={onViewMode}
            accessibilityPrefix="View as"
          />
          <OptionPills
            options={KIND_OPTIONS}
            isSelected={(value) => value === kind}
            onSelect={onKind}
            accessibilityPrefix="Show"
          />
        </View>
      </ScreenHeader>
    </>
  );
}

interface AgendaListProps {
  days: readonly {
    key: string;
    label: string;
    groups: TimeGroup<OrderCardOrder>[];
  }[];
  nowMs: number;
  hasUpcomingDays: boolean;
  isFiltered: boolean;
  onClearFilter: () => void;
}

function AgendaList({ days, nowMs, hasUpcomingDays, isFiltered, onClearFilter }: AgendaListProps) {
  const isEmpty = !hasUpcomingDays && days[0]?.groups.length === 0;
  if (isEmpty) {
    return (
      <EmptyState
        icon="calendar"
        title={isFiltered ? "Nothing matches this filter" : "No scheduled orders yet"}
        message={
          isFiltered
            ? "Try showing all orders."
            : "Pre-orders and scheduled orders customers place appear here, sorted by when they asked for them."
        }
        actionLabel={isFiltered ? "Show all" : undefined}
        onAction={isFiltered ? onClearFilter : undefined}
        inset
      />
    );
  }
  return (
    <View style={styles.agenda}>
      {days.map((day) => (
        <DayTimeline
          key={day.key}
          dayKey={day.key}
          nowMs={nowMs}
          groups={day.groups}
          onOpenOrder={openOrder}
        />
      ))}
      <Text style={styles.agendaFoot}>Days further out appear as orders come in.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  toolbar: { gap: spacing.sm },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 96,
    gap: spacing.lg,
  },
  day: { marginTop: spacing.xs },
  agenda: { gap: spacing.xl },
  agendaFoot: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});

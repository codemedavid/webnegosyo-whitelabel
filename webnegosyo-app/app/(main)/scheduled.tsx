import React, { useState, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
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
  getScheduleBand,
  todayKey,
  type ScheduledSourceOrder,
  type ScheduleBand,
} from "../../lib/scheduled-orders";
import { hasLiveOrderBackend } from "../../lib/order-backend";
import { useAuthStore } from "../../stores/auth-store";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { OrderCard, type OrderCardOrder } from "../../components/OrderCard";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

/** Pre-orders sit days out, so read deeper than the queue's default page. */
const SCHEDULED_FETCH_LIMIT = 300;

/** The agenda re-bands as time passes; twice a minute is plenty. */
const TIMER_TICK_MS = 30_000;

type ScheduledScreenOrder = ScheduledSourceOrder & OrderCardOrder;

const BAND_COLORS: Record<ScheduleBand, string> = {
  overdue: colors.danger,
  "due-soon": colors.urgencyWarning,
  upcoming: colors.textSecondary,
};

const BAND_SUFFIX: Record<ScheduleBand, string> = {
  overdue: " · Overdue",
  "due-soon": " · Due soon",
  upcoming: "",
};

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

  const scheduled = useMemo(() => {
    const scoped = filterOrdersToScope(scope, orders) as ScheduledScreenOrder[] | undefined;
    return selectScheduledOrders(scoped);
  }, [scope, orders]);

  const strip = useMemo(() => buildDateStrip(scheduled, nowMs), [scheduled, nowMs]);

  // A selected day can empty out under the merchant (orders complete, the day
  // passes); an unknown key falls back to Today rather than a blank screen.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activeKey =
    selectedKey && strip.some((day) => day.key === selectedKey)
      ? selectedKey
      : todayKey(nowMs);

  const groups = useMemo(
    () => groupByTime(ordersForDay(scheduled, activeKey, nowMs)),
    [scheduled, activeKey, nowMs],
  );

  if (!hasBackend || error) {
    return (
      <View style={styles.screen}>
        <Header outletName={outletName} count={0} />
        <ErrorState
          message={error ?? "This store's order backend is not configured yet. Please contact support."}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Header outletName={outletName} count={0} />
        <LoadingState message="Loading the schedule…" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header outletName={outletName} count={scheduled.length} />

      <View style={styles.stripWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {strip.map((day) => {
            const isActive = day.key === activeKey;
            return (
              <TouchableOpacity
                key={day.key}
                style={[styles.dayChip, isActive && styles.dayChipActive]}
                onPress={() => setSelectedKey(day.key)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${day.label}, ${day.count} scheduled order${day.count === 1 ? "" : "s"}`}
              >
                <Text style={[styles.dayChipLabel, isActive && styles.dayChipLabelActive]}>
                  {day.label}
                </Text>
                {day.count > 0 ? (
                  <View style={[styles.dayChipCount, isActive && styles.dayChipCountActive]}>
                    <Text style={[styles.dayChipCountText, isActive && styles.dayChipCountTextActive]}>
                      {day.count}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {scheduled.length === 0 ? "No scheduled orders yet" : "Nothing on this day"}
          </Text>
          <Text style={styles.emptyBody}>
            Pre-orders placed by customers appear here, sorted by when they asked for them.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.agenda}>
          {groups.map((group) => {
            const band = getScheduleBand(group.orders[0].scheduledAtMs, nowMs);
            return (
              <View key={`${group.label}-${group.orders[0]._id}`} style={styles.timeGroup}>
                <View style={styles.timeHeader}>
                  <View style={[styles.timeDot, { backgroundColor: BAND_COLORS[band] }]} />
                  <Text style={[styles.timeLabel, { color: BAND_COLORS[band] }]}>
                    {group.label}
                    {BAND_SUFFIX[band]}
                  </Text>
                  <View style={styles.timeRule} />
                </View>
                {group.orders.map((order) => (
                  <OrderCard
                    key={order._id}
                    order={order}
                    compact
                    onPress={() => router.push(`/(main)/order/${order._id}`)}
                  />
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function Header({ outletName, count }: { outletName: string | null; count: number }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.title}>Scheduled</Text>
        {outletName ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {outletName}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerRight}>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count} upcoming</Text>
        </View>
        <WorkspaceSwitcher />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.md,
  },
  headerText: { flexShrink: 1 },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  countPill: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  countText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  stripWrap: { marginBottom: spacing.sm },
  strip: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    flexDirection: "row",
  },
  dayChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: colors.card,
  },
  dayChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayChipLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
  dayChipLabelActive: { color: colors.textOnDark },
  dayChipCount: {
    minWidth: 20,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignItems: "center",
  },
  dayChipCountActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  dayChipCountText: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  dayChipCountTextActive: { color: colors.textOnDark },
  agenda: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 96,
  },
  timeGroup: { marginBottom: spacing.md },
  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  timeDot: { width: 8, height: 8, borderRadius: 4 },
  timeLabel: {
    ...typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
  timeRule: { flex: 1, height: 1, backgroundColor: colors.separator },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: { ...typography.heading, color: colors.textPrimary },
  emptyBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: "center",
  },
});

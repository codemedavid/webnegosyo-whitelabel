import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { EmptyState } from "../EmptyState";
import { OrderCard, type OrderCardOrder } from "../OrderCard";
import {
  getScheduleBand,
  type ScheduledOrder,
  type ScheduleBand,
  type TimeGroup,
} from "../../lib/scheduled-orders";
import { dayLabel, summarizeDay } from "../../lib/schedule-calendar";

/**
 * One day of the schedule as a time rail: the requested time on the left,
 * a dot coloured by how urgent it has become, and the order cards beside it.
 *
 * The groups are computed by the caller with `groupByTime` (the screen owns
 * the schedule logic; this owns the drawing) so the month view and the
 * agenda view render the exact same day the exact same way.
 */
export type TimelineOrder = ScheduledOrder<OrderCardOrder>;

interface DayTimelineProps {
  dayKey: string;
  nowMs: number;
  groups: readonly TimeGroup<OrderCardOrder>[];
  onOpenOrder: (orderId: string) => void;
  /** The next day that has orders, for the empty state's shortcut. */
  nextKey?: string | null;
  onJumpNext?: (key: string) => void;
  /** Off when a list of days already labels each day. */
  showHeading?: boolean;
}

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

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "Nothing today" / "Nothing tomorrow" / "Nothing on Sat, Sep 5" */
function emptyTitle(label: string): string {
  if (label === "Today" || label === "Tomorrow") return `Nothing ${label.toLowerCase()}`;
  return `Nothing on ${label}`;
}

/** "3 orders · 1 pre-order · ₱1,500.00" */
function summaryLine(orders: readonly TimelineOrder[]): string {
  const summary = summarizeDay(orders);
  const parts = [plural(summary.count, "order")];
  if (summary.presell > 0) parts.push(plural(summary.presell, "pre-order"));
  parts.push(formatPeso(summary.revenue));
  return parts.join(" · ");
}

export function DayTimeline({
  dayKey,
  nowMs,
  groups,
  onOpenOrder,
  nextKey,
  onJumpNext,
  showHeading = true,
}: DayTimelineProps) {
  const label = dayLabel(dayKey, nowMs);
  const orders = groups.flatMap((group) => group.orders);

  if (orders.length === 0) {
    return (
      <View>
        {showHeading ? <Text style={styles.dayTitle}>{label}</Text> : null}
        <EmptyState
          icon="calendar"
          title={emptyTitle(label)}
          message="Days with orders are marked on the calendar."
          actionLabel={nextKey && onJumpNext ? `Next: ${dayLabel(nextKey, nowMs)}` : undefined}
          onAction={nextKey && onJumpNext ? () => onJumpNext(nextKey) : undefined}
          inset
        />
      </View>
    );
  }

  return (
    <View>
      {showHeading ? (
        <View style={styles.heading}>
          <Text style={styles.dayTitle}>{label}</Text>
          <Text style={styles.daySummary}>{summaryLine(orders)}</Text>
        </View>
      ) : null}
      {groups.map((group, index) => {
        const band = getScheduleBand(group.orders[0].scheduledAtMs, nowMs);
        const color = BAND_COLORS[band];
        const isLast = index === groups.length - 1;
        return (
          <View key={`${group.label}-${group.orders[0]._id}`} style={styles.slot}>
            <View style={styles.rail}>
              <Text style={[styles.time, { color }]} numberOfLines={2}>
                {group.label}
                {BAND_SUFFIX[band]}
              </Text>
              <View style={styles.railLine}>
                <View style={[styles.railDot, { backgroundColor: color }]} />
                {isLast ? null : <View style={styles.railStem} />}
              </View>
            </View>
            <View style={styles.cards}>
              {group.orders.map((order) => (
                <OrderCard key={order._id} order={order} compact onPress={() => onOpenOrder(order._id)} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const RAIL_WIDTH = 68;
const DOT_SIZE = 10;

const styles = StyleSheet.create({
  heading: { marginBottom: spacing.md, gap: 2 },
  dayTitle: { ...typography.heading, color: colors.textPrimary },
  daySummary: { ...typography.caption, color: colors.textSecondary, fontVariant: ["tabular-nums"] },
  slot: { flexDirection: "row", alignItems: "stretch" },
  rail: { width: RAIL_WIDTH, flexDirection: "row", alignItems: "flex-start" },
  time: {
    flex: 1,
    ...typography.small,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingTop: spacing.sm + 2,
    paddingRight: spacing.xs,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  railLine: { width: DOT_SIZE, alignItems: "center", alignSelf: "stretch" },
  railDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radius.full,
    marginTop: spacing.sm + 4,
    borderWidth: 2,
    borderColor: colors.background,
  },
  railStem: { flex: 1, width: 2, backgroundColor: colors.separator, marginTop: 2 },
  cards: { flex: 1, paddingLeft: spacing.sm, gap: 0 },
});

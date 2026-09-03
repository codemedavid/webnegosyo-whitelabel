import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { IconButton } from "../IconButton";
import {
  buildMonthGrid,
  dayLabel,
  monthTitle,
  type CalendarCell,
  type DayLoad,
  type MonthCursor,
} from "../../lib/schedule-calendar";
import { todayKey } from "../../lib/scheduled-orders";

/**
 * The month grid at the top of the Schedule tab.
 *
 * A merchant taking pre-orders lives by "what have I promised, and when?".
 * A strip of chips answered that one day at a time; a month answers it at a
 * glance: loaded days carry a count, pre-sold days a coral dot, and today an
 * overdue dot when something slipped. Tapping a day drives the timeline
 * underneath, so the grid never has to show more than a count.
 *
 * Padding days from the neighbouring months stay tappable — a pre-order for
 * the 2nd of next month is one tap away, not a page turn and a tap.
 */
interface MonthCalendarProps {
  cursor: MonthCursor;
  nowMs: number;
  load: ReadonlyMap<string, DayLoad>;
  selectedKey: string;
  onSelectDay: (key: string) => void;
  onShiftMonth: (delta: number) => void;
  onJumpToday: () => void;
}

const WEEKDAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const EMPTY_LOAD: DayLoad = { total: 0, presell: 0, overdue: 0 };

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "Sat, Sep 5, 3 orders, 2 pre-orders" — what a screen reader says for a cell. */
function cellLabel(cell: CalendarCell, load: DayLoad, nowMs: number): string {
  const parts = [dayLabel(cell.key, nowMs)];
  if (load.total === 0) return `${parts[0]}, nothing scheduled`;
  parts.push(plural(load.total, "order"));
  if (load.presell > 0) parts.push(plural(load.presell, "pre-order"));
  if (load.overdue > 0) parts.push(`${load.overdue} overdue`);
  return parts.join(", ");
}

export function MonthCalendar({
  cursor,
  nowMs,
  load,
  selectedKey,
  onSelectDay,
  onShiftMonth,
  onJumpToday,
}: MonthCalendarProps) {
  const rows = buildMonthGrid(cursor, nowMs);
  const today = todayKey(nowMs);
  const isOnToday =
    selectedKey === today && rows.some((row) => row.some((cell) => cell.isToday));

  return (
    <View style={styles.card}>
      <View style={styles.bar}>
        <IconButton icon="chevron-left" label="Previous month" onPress={() => onShiftMonth(-1)} />
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{monthTitle(cursor)}</Text>
          {isOnToday ? null : (
            <TouchableOpacity
              onPress={onJumpToday}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Back to today"
            >
              <Text style={styles.todayLink}>Today</Text>
            </TouchableOpacity>
          )}
        </View>
        <IconButton icon="chevron" label="Next month" onPress={() => onShiftMonth(1)} />
      </View>

      <View style={styles.weekdays}>
        {WEEKDAY_HEADERS.map((letter, index) => (
          <Text key={`${letter}-${index}`} style={styles.weekday}>
            {letter}
          </Text>
        ))}
      </View>

      {rows.map((row) => (
        <View key={row[0].key} style={styles.week}>
          {row.map((cell) => (
            <DayCell
              key={cell.key}
              cell={cell}
              load={load.get(cell.key) ?? EMPTY_LOAD}
              nowMs={nowMs}
              isSelected={cell.key === selectedKey}
              onPress={() => onSelectDay(cell.key)}
            />
          ))}
        </View>
      ))}

      <View style={styles.legend}>
        <LegendDot color={colors.accent} label="Pre-order" />
        <LegendDot color={colors.danger} label="Overdue" />
      </View>
    </View>
  );
}

interface DayCellProps {
  cell: CalendarCell;
  load: DayLoad;
  nowMs: number;
  isSelected: boolean;
  onPress: () => void;
}

function DayCell({ cell, load, nowMs, isSelected, onPress }: DayCellProps) {
  const isMuted = !cell.isCurrentMonth || (cell.isPast && load.total === 0);
  return (
    <TouchableOpacity
      style={styles.cell}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={cellLabel(cell, load, nowMs)}
    >
      <View
        style={[
          styles.dayDisc,
          cell.isToday && styles.dayDiscToday,
          isSelected && styles.dayDiscSelected,
        ]}
      >
        <Text
          style={[
            styles.dayNumber,
            isMuted && styles.dayNumberMuted,
            cell.isToday && styles.dayNumberToday,
            isSelected && styles.dayNumberSelected,
          ]}
        >
          {cell.day}
        </Text>
      </View>
      <View style={styles.loadRow}>
        {load.total > 0 ? (
          <View style={[styles.countPill, isSelected && styles.countPillSelected]}>
            <Text style={[styles.countText, isSelected && styles.countTextSelected]}>
              {load.total}
            </Text>
          </View>
        ) : null}
        {load.presell > 0 ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
        {load.overdue > 0 ? <View style={[styles.dot, { backgroundColor: colors.danger }]} /> : null}
      </View>
    </TouchableOpacity>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const DISC_SIZE = 32;
const CELL_HEIGHT = 56;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    ...shadow.sm,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleWrap: { flex: 1, alignItems: "center", gap: 2 },
  title: { ...typography.heading, color: colors.textPrimary },
  todayLink: { ...typography.caption, color: colors.accent, fontWeight: "700" },
  weekdays: { flexDirection: "row", marginTop: spacing.xs, marginBottom: spacing.xs },
  weekday: {
    flex: 1,
    textAlign: "center",
    ...typography.small,
    fontWeight: "700",
    color: colors.textTertiary,
  },
  week: { flexDirection: "row" },
  cell: {
    flex: 1,
    height: CELL_HEIGHT,
    alignItems: "center",
    paddingTop: spacing.xs,
  },
  dayDisc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  dayDiscToday: { borderWidth: 1.5, borderColor: colors.accent },
  dayDiscSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayNumber: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  dayNumberMuted: { color: colors.textTertiary, fontWeight: "400" },
  dayNumberToday: { color: colors.accent, fontWeight: "800" },
  dayNumberSelected: { color: colors.textOnDark, fontWeight: "800" },
  loadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 16,
    marginTop: 2,
  },
  countPill: {
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
  },
  countPillSelected: { backgroundColor: colors.primary },
  countText: {
    ...typography.small,
    fontWeight: "800",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  countTextSelected: { color: colors.textOnDark },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendText: { ...typography.small, color: colors.textSecondary, fontWeight: "600" },
});

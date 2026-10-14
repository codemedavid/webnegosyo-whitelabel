import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { DrawerRow, SummaryModel, SummaryStat } from "../../lib/activity/summary-model";
import type { PersonRow } from "../../lib/activity/summary-people";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { ListRow } from "../ListRow";
import { SectionHeader } from "../SectionHeader";

export function SummaryStats({ stats, onOpen }: { stats: readonly SummaryStat[]; onOpen: (stat: SummaryStat) => void }) {
  return (
    <View style={styles.grid}>
      {stats.map((stat) => (
        <TouchableOpacity
          key={stat.key}
          style={styles.stat}
          onPress={() => onOpen(stat)}
          accessibilityRole="button"
          accessibilityLabel={`${stat.label}: ${stat.value}, ${stat.hint}. Opens the activity.`}
        >
          <Text style={styles.statValue} numberOfLines={1}>
            {stat.value}
          </Text>
          <Text style={styles.statLabel} numberOfLines={2}>
            {stat.label}
          </Text>
          <Text style={styles.statHint} numberOfLines={1}>
            {stat.hint}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Vouchers, rewards and Senior/PWD: given on purpose, so never counted as a leak. */
export function GivenAwayLine({ line }: { line: string | null }) {
  if (!line) return null;
  return (
    <View style={styles.given}>
      <Text style={styles.givenLabel}>Given away on purpose</Text>
      <Text style={styles.givenText}>{line}</Text>
    </View>
  );
}

export function DrawersSection({ drawers, onOpen }: { drawers: SummaryModel["drawers"]; onOpen: (row: DrawerRow) => void }) {
  if (!drawers.line) return null;
  return (
    <View>
      <SectionHeader title="Drawers" hint={drawers.line} />
      {drawers.offRows.length > 0 ? (
        <View style={styles.group}>
          {drawers.offRows.map((row, index) => (
            <ListRow
              key={row.eventId}
              icon="drawer"
              title={row.label}
              subtitle={row.time}
              onPress={() => onOpen(row)}
              grouped={index < drawers.offRows.length - 1}
              accessibilityLabel={`${row.label}, ${row.time}. Opens the shift.`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PersonChip({ status }: { status: PersonRow["status"] }) {
  if (status === "check") {
    return (
      <View style={[styles.chip, styles.chipCheck]}>
        <Icon name="warning" size={12} color={colors.statusPending.text} strokeWidth={2.25} />
        <Text style={[styles.chipText, styles.chipCheckText]}>Check</Text>
      </View>
    );
  }
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{status === "new" ? "New" : "Normal"}</Text>
    </View>
  );
}

/** Each person against their OWN normal — no ranks, no red names (spec §5). */
export function PeopleSection({ people, onOpen }: { people: readonly PersonRow[]; onOpen: (row: PersonRow) => void }) {
  if (people.length === 0) return null;
  return (
    <View>
      <SectionHeader title="By person" hint="Each person against their own normal" />
      <View style={styles.group}>
        {people.map((person, index) => (
          <ListRow
            key={person.actorUserId}
            icon="account"
            title={person.name}
            subtitle={person.line}
            trailing={<PersonChip status={person.status} />}
            onPress={() => onOpen(person)}
            grouped={index < people.length - 1}
            accessibilityLabel={`${person.name}. ${person.line}. ${person.status === "check" ? "Worth a check" : person.status === "new" ? "New" : "Normal"}.`}
          />
        ))}
      </View>
    </View>
  );
}

export function FlagsFooter({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return null;
  return (
    <TouchableOpacity style={styles.footer} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${count} flags waiting. See them.`}>
      <Text style={styles.footerText}>Flags waiting: {count}</Text>
      <Text style={styles.footerLink}>See them</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.lg },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 96,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    gap: 2,
    ...shadow.sm,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  statLabel: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  statHint: { ...typography.caption, color: colors.textMuted },
  given: { marginTop: spacing.lg, gap: 2 },
  givenLabel: { ...typography.caption, fontWeight: "700", color: colors.textMuted },
  givenText: { ...typography.caption, color: colors.textMuted },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
  },
  chipCheck: { backgroundColor: colors.statusPending.bg },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  chipCheckText: { color: colors.statusPending.text },
  footer: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  footerText: { ...typography.body, color: colors.textPrimary },
  footerLink: { ...typography.body, fontWeight: "700", color: colors.textPrimary, textDecorationLine: "underline" },
});

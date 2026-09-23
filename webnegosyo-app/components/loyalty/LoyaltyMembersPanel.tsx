import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { MemberRow } from "./MemberRow";
import { loyaltyMemberHref } from "../../lib/navigation";
import type { LoyaltyMember, LoyaltyMemberStatus, LoyaltyMemberTotals } from "../../lib/loyalty/members";
import { fetchLoyaltyMembers } from "../../lib/loyalty/members-repo";

/** Debounce on the search box — a stamp card list is a server round trip. */
const SEARCH_SETTLE_MS = 350;

type Filter = LoyaltyMemberStatus | "all";

const FILTERS: readonly { label: string; value: Filter }[] = [
  { label: "All", value: "all" },
  { label: "Reward ready", value: "reward_ready" },
  { label: "Almost there", value: "almost_there" },
  { label: "Gone quiet", value: "dormant" },
];

function countFor(filter: Filter, totals: LoyaltyMemberTotals | null): number | null {
  if (!totals) return null;
  switch (filter) {
    case "all":
      return totals.total;
    case "reward_ready":
      return totals.rewardReady;
    case "almost_there":
      return totals.almostThere;
    case "dormant":
      return totals.dormant;
    default:
      return null;
  }
}

/**
 * Who is on the stamp card, nearest to a reward first.
 *
 * The ORDER comes from the platform, not from here — the same ranking the web
 * admin shows — so a merchant who checks on their phone and a merchant who
 * checks on a laptop are told to call the same person.
 *
 * `reloadKey` lets the parent force a refresh after a program change: the
 * counts on this panel are downstream of the programmes above it.
 */
export function LoyaltyMembersPanel({
  tenantId,
  reloadKey = 0,
}: {
  tenantId: string | null;
  reloadKey?: number;
}) {
  const [members, setMembers] = useState<LoyaltyMember[]>([]);
  const [totals, setTotals] = useState<LoyaltyMemberTotals | null>(null);
  const [isTruncated, setTruncated] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [isRefreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [settledQuery, setSettledQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(query), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setRefreshing(true);
    const result = await fetchLoyaltyMembers(tenantId, {
      search: settledQuery,
      status: filter === "all" ? null : filter,
    });
    setRefreshing(false);
    if (!result.ok) {
      setStatus(result.reason === "forbidden" ? "forbidden" : "error");
      return;
    }
    setMembers(result.members);
    setTotals(result.totals);
    setTruncated(result.isTruncated);
    setStatus("ready");
  }, [tenantId, settledQuery, filter]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const open = useCallback((member: LoyaltyMember) => {
    router.push(loyaltyMemberHref(member.customerKey));
  }, []);

  const headline = useMemo(() => {
    if (!totals) return null;
    if (totals.total === 0) return null;
    const parts = [`${totals.total} on the card`];
    if (totals.rewardReady > 0) parts.push(`${totals.rewardReady} can claim now`);
    if (totals.almostThere > 0) parts.push(`${totals.almostThere} almost there`);
    return parts.join(" · ");
  }, [totals]);

  if (status === "forbidden") {
    return <EmptyState title="No access" message="Your account cannot see loyalty members." />;
  }

  if (status === "error") {
    return (
      <ErrorState
        message="Your members could not be loaded."
        onRetry={() => {
          setStatus("loading");
          void load();
        }}
      />
    );
  }

  return (
    <View style={styles.panel}>
      {headline ? <Text style={styles.headline}>{headline}</Text> : null}

      <TextInput
        style={styles.search}
        placeholder="Search a name or number"
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search members"
      />

      <View style={styles.filters}>
        {FILTERS.map((option) => {
          const isActive = option.value === filter;
          const count = countFor(option.value, totals);
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => setFilter(option.value)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                {option.label}
                {count === null ? "" : ` ${count}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {status === "loading" ? (
        <ActivityIndicator style={styles.spinner} color={colors.accent} />
      ) : members.length === 0 ? (
        <EmptyState
          title={settledQuery || filter !== "all" ? "Nobody matches" : "No members yet"}
          message={
            settledQuery || filter !== "all"
              ? "Try a different search or filter."
              : "Members appear here the moment a customer earns their first stamp. Loyalty is linked to a phone number, so orders placed without one cannot earn."
          }
        />
      ) : (
        <View style={styles.list}>
          {isRefreshing ? <Text style={styles.refreshing}>Updating…</Text> : null}
          {members.map((member) => (
            <MemberRow key={member.customerKey} member={member} onPress={open} />
          ))}
        </View>
      )}

      {isTruncated ? (
        <Text style={styles.truncated}>
          Showing the first members only — search for someone specific to find them.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm },
  headline: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  search: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  chipLabelActive: { color: colors.textOnDark, fontWeight: "700" },
  spinner: { marginVertical: spacing.lg },
  list: { gap: spacing.sm },
  refreshing: { ...typography.small, color: colors.textSecondary },
  truncated: { ...typography.small, color: colors.textSecondary },
});

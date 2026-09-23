import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Linking, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { useAuthStore } from "../../../stores/auth-store";
import { colors, typography, spacing, radius } from "../../../theme/colors";
import { BackHeader } from "../../../components/BackHeader";
import { LoadingState } from "../../../components/LoadingState";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { MemberProgressCard } from "../../../components/loyalty/MemberProgress";
import { MemberRewardsCard } from "../../../components/loyalty/MemberRewardsCard";
import { MemberAdjustCard } from "../../../components/loyalty/MemberAdjustCard";
import { MemberOrdersCard } from "../../../components/loyalty/MemberOrdersCard";
import { describeMemberStatus, type LoyaltyMemberDetail } from "../../../lib/loyalty/members";
import { fetchLoyaltyMember } from "../../../lib/loyalty/members-repo";

/**
 * One customer's whole loyalty standing.
 *
 * Everything a merchant asks at the counter, on one screen: who they are, how
 * to reach them, how close they are on every card they hold, what rewards they
 * are sitting on, what they have ordered and where it went — and the two
 * corrections a counter actually needs.
 *
 * The identity key is the route param because loyalty is keyed by phone, not
 * by a customer id: a card can exist before the profile row that names it.
 */
export default function LoyaltyMemberScreen() {
  const { customerKey } = useLocalSearchParams<{ customerKey: string }>();
  const tenantId = useAuthStore((s) => s.tenantId);

  const [detail, setDetail] = useState<LoyaltyMemberDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "missing" | "error">("loading");
  const [isRefreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !customerKey) return;
    const result = await fetchLoyaltyMember(tenantId, customerKey);
    if (!result.ok) {
      setStatus(
        result.reason === "forbidden" ? "forbidden" : result.reason === "missing" ? "missing" : "error",
      );
      return;
    }
    setDetail(result.detail);
    setStatus("ready");
  }, [tenantId, customerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (status === "loading") {
    return (
      <View style={styles.container}>
        <BackHeader title="Member" />
        <LoadingState />
      </View>
    );
  }

  if (status !== "ready" || !detail) {
    return (
      <View style={styles.container}>
        <BackHeader title="Member" />
        {status === "forbidden" ? (
          <EmptyState title="No access" message="Your account cannot see loyalty members." />
        ) : status === "missing" ? (
          <EmptyState
            title="Not on the card"
            message="This customer holds no stamp card at this store."
          />
        ) : (
          <ErrorState
            message="This member could not be loaded."
            onRetry={() => {
              setStatus("loading");
              void load();
            }}
          />
        )}
      </View>
    );
  }

  const { member, profile, rewards, orders, addresses, history } = detail;
  const name = member.name?.trim() || member.phone || "Guest";
  const statusCopy = describeMemberStatus(member.status);

  return (
    <View style={styles.container}>
      <BackHeader title={name} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      >
        {/* ── Who they are ───────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.statusLine}>
            {statusCopy.label} · {statusCopy.hint}
          </Text>

          {member.phone ? (
            <Text
              style={styles.link}
              accessibilityRole="link"
              onPress={() => void Linking.openURL(`tel:${member.phone}`)}
            >
              {member.phone}
            </Text>
          ) : (
            <Text style={styles.muted}>No phone on file</Text>
          )}
          {member.email ? <Text style={styles.value}>{member.email}</Text> : null}

          {addresses.length > 0 ? (
            <View style={styles.block}>
              <Text style={styles.label}>
                {addresses.length === 1 ? "Address" : "Addresses"}
              </Text>
              {addresses.map((address) => (
                <Text key={address} style={styles.value}>
                  {address}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>
              No address on file — none of their orders carried one.
            </Text>
          )}

          {profile ? (
            <View style={styles.stats}>
              <Stat label="Orders" value={String(profile.orderCount)} />
              <Stat label="Spent" value={peso(profile.totalSpent)} />
              <Stat label="Average" value={peso(profile.averageOrderValue)} />
            </View>
          ) : (
            <Text style={styles.muted}>
              No customer profile yet — their spend totals appear once an order is captured
              against this number.
            </Text>
          )}

          {profile?.notes ? <Text style={styles.note}>{profile.notes}</Text> : null}
          {profile?.smsOptOut ? (
            <Text style={styles.warn}>Opted out of SMS — do not include in campaigns.</Text>
          ) : null}
        </View>

        {/* ── Where they stand ───────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Progress</Text>
        {member.programs.length === 0 ? (
          <EmptyState title="No cards" message="This customer holds no stamp card." />
        ) : (
          member.programs.map((progress) => (
            <MemberProgressCard key={progress.programId} progress={progress} />
          ))
        )}

        {/* ── What they can claim ────────────────────────────────────── */}
        <MemberRewardsCard
          tenantId={tenantId}
          rewards={rewards}
          onChanged={() => void load()}
          onError={(message) => Alert.alert("Could not settle that reward", message)}
        />

        {/* ── Fix a card ─────────────────────────────────────────────── */}
        <MemberAdjustCard
          tenantId={tenantId}
          customerKey={member.customerKey}
          programs={member.programs}
          onChanged={() => void load()}
        />

        {/* ── What they ordered ──────────────────────────────────────── */}
        <MemberOrdersCard orders={orders} history={history} />
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function peso(amount: number): string {
  return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH", {
    maximumFractionDigits: 0,
  })}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: spacing.xs,
  },
  name: { ...typography.title, color: colors.textPrimary },
  statusLine: { ...typography.caption, color: colors.textSecondary },
  link: { ...typography.body, color: colors.accent, fontWeight: "700", marginTop: spacing.xs },
  value: { ...typography.body, color: colors.textPrimary },
  muted: { ...typography.caption, color: colors.textSecondary },
  note: { ...typography.caption, color: colors.textPrimary, fontStyle: "italic" },
  warn: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  block: { marginTop: spacing.sm, gap: 2 },
  label: { ...typography.small, color: colors.textSecondary, textTransform: "uppercase", fontWeight: "700" },
  stats: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  stat: { flex: 1 },
  statValue: { ...typography.heading, color: colors.textPrimary },
  statLabel: { ...typography.small, color: colors.textSecondary },
  sectionTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.sm },
});

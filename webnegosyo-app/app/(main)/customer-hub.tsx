import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";

import { useAuthStore } from "../../stores/auth-store";
import { fetchHubOverview } from "../../lib/customer-hub/repo";
import {
  describeCoverage,
  formatRate,
  selectWindow,
  type HubOverview,
} from "../../lib/customer-hub/overview";
import { useAccountBranchScope } from "../../lib/use-branch-scope";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Icon } from "../../components/Icon";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SubScreenLinks } from "../../components/SubScreenLinks";

/**
 * The Customer Hub overview.
 *
 * Answers the one question the guest list cannot: are they coming back? Every
 * number is computed on the platform (`/api/customers/hub-overview`), from
 * whichever database holds this store's identified orders — so a merchant on
 * Convex, on their own Supabase, or on the platform sees the same measure, and
 * a POS sale counts the same as a web order.
 *
 * The repeat rate is stated per CUSTOMER: of the identified guests who ordered
 * in the window, how many had ordered before. Note that the Branches screen
 * shows a per-ORDER repeat figure, which is a different true number.
 *
 * The coverage line under the rate is not decoration. Orders placed without a
 * name or number cannot be attributed to anyone, and a repeat rate drawn from a
 * third of the till would otherwise read as a fact about the business.
 */

const WINDOW_CHOICES = [7, 30, 90] as const;

export default function CustomerHubScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const customerHubEnabled = useAuthStore((s) => s.customerHubEnabled);
  const scope = useAccountBranchScope();

  const [overview, setOverview] = useState<HubOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "disabled" | "forbidden" | "error">(
    "loading",
  );
  const [days, setDays] = useState<number>(30);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const result = await fetchHubOverview({ tenantId, outletId: scope.kind === "branch" ? scope.outletId : null });
    if (result.ok) {
      setOverview(result.overview);
      setStatus("ready");
      return;
    }
    setOverview(null);
    setStatus(result.reason === "unavailable" ? "error" : result.reason);
  }, [tenantId, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const window = useMemo(
    () => (overview ? selectWindow(overview, days) : null),
    [overview, days],
  );

  // The store flag is read locally too, so a store outside the pilot gets the
  // explanation immediately instead of a spinner followed by a refusal.
  if (!customerHubEnabled || status === "disabled") {
    return (
      <Shell>
        <EmptyState
          title="Not switched on yet"
          message="The Customer Hub is being rolled out store by store. It opens once this store's order history has been checked."
        />
      </Shell>
    );
  }

  if (status === "forbidden") {
    return (
      <Shell>
        <EmptyState
          title="No access"
          message="Your account does not have permission to view customer information."
        />
      </Shell>
    );
  }

  if (status === "loading") {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Customers" />
        <LoadingState />
      </View>
    );
  }

  if (status === "error" || !overview || !window) {
    return (
      <Shell>
        <ErrorState
          message="Customer figures could not be loaded."
          onRetry={() => {
            setStatus("loading");
            void load();
          }}
        />
      </Shell>
    );
  }

  const coverageNote = describeCoverage(window, overview.coverage);
  const change = window.repeatRateChange;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Customers" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.tabs}>
          {WINDOW_CHOICES.map((choice) => {
            const active = choice === days;
            return (
              <TouchableOpacity
                key={choice}
                onPress={() => setDays(choice)}
                style={[styles.tab, active && styles.tabActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {choice} days
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Came back</Text>
          <Text style={styles.heroValue}>
            {formatRate(window.identifiedCustomers > 0 ? window.repeatRate : null)}
          </Text>
          <Text style={styles.heroSub}>
            {window.returningCustomers} of {window.identifiedCustomers} customers had ordered before
          </Text>
          {change !== 0 && window.identifiedCustomers > 0 ? (
            <View style={styles.deltaRow}>
              <Icon
                name="trends"
                size={14}
                color={change > 0 ? colors.success : colors.danger}
              />
              <Text style={[styles.delta, change > 0 ? styles.deltaUp : styles.deltaDown]}>
                {change > 0 ? "Up" : "Down"} {formatRate(Math.abs(change))} vs the {days} days
                before
              </Text>
            </View>
          ) : null}
          {coverageNote ? <Text style={styles.caveat}>{coverageNote}</Text> : null}
        </View>

        <View style={styles.row}>
          <Stat label="New" value={String(window.newCustomers)} />
          <Stat label="Returning" value={String(window.returningCustomers)} />
          <Stat label="Slipping away" value={String(window.atRiskCustomers)} />
        </View>

        {overview.topItems.length > 0 ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>What they keep ordering</Text>
            {overview.topItems.map((item, index) => (
              <View key={item.key} style={styles.itemRow}>
                <Text style={styles.itemRank}>{index + 1}</Text>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemQty}>{item.quantity}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* The guest list and the reward scheme hang under this overview
            rather than beside it on the bar: "are they coming back?" is the
            question, and these two are what a merchant does about the answer. */}
        <SubScreenLinks parent="customer-hub" title="Who they are" />
      </ScrollView>
    </View>
  );
}

/**
 * Header + centred state + the sub-screen doors.
 *
 * The doors matter most in exactly the states that have nothing else on them:
 * the Hub is dark for every store outside the pilot, and without them that
 * screen is a dead end with the guest list nowhere in sight.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.container}>
      <ScreenHeader title="Customers" />
      <View style={styles.shellBody}>{children}</View>
      <View style={styles.shellLinks}>
        <SubScreenLinks parent="customer-hub" title="Who they are" />
      </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  shellBody: { flex: 1, justifyContent: "center" },
  shellLinks: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  tabs: { flexDirection: "row", gap: spacing.xs },
  tab: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.card,
  },
  tabActive: { backgroundColor: colors.primary },
  tabLabel: { ...typography.body, color: colors.textSecondary },
  tabLabelActive: { color: colors.textOnDark, fontWeight: "600" },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.sm,
  },
  heroLabel: { ...typography.caption, color: colors.textSecondary },
  heroValue: { ...typography.title, color: colors.textPrimary },
  heroSub: { ...typography.body, color: colors.textSecondary },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  delta: { ...typography.caption, fontWeight: "600" },
  deltaUp: { color: colors.success },
  deltaDown: { color: colors.danger },
  caveat: { ...typography.caption, color: colors.textSecondary, fontStyle: "italic" },
  row: { flexDirection: "row", gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  statValue: { ...typography.heading, color: colors.textPrimary },
  statLabel: { ...typography.caption, color: colors.textSecondary },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  panelTitle: { ...typography.heading, color: colors.textPrimary },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  itemRank: { ...typography.caption, color: colors.textSecondary, width: 18 },
  itemName: { ...typography.body, color: colors.textPrimary, flex: 1 },
  itemQty: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
});

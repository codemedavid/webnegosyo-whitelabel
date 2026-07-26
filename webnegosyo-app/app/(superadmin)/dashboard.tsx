import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { router, type Href } from "expo-router";
import { supabase } from "../../lib/supabase";
import {
  summarizeTenants,
  type TenantListRow,
  type TenantSummary,
} from "../../lib/tenant-list";
import { pluralize } from "../../lib/superadmin-ui";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { ScreenHeader } from "../../components/superadmin/ScreenHeader";
import { Monogram } from "../../components/superadmin/Monogram";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

const TENANT_COLUMNS =
  "id, slug, name, is_active, convex_deployment_url, menu_engineering_enabled, bundles_enabled, app_enabled, lalamove_enabled";

const RECENT_LIMIT = 5;

/**
 * A single platform metric. Rendered as a quiet tile rather than a heavy card
 * so the ink header stays the loudest element on the screen.
 */
function MetricTile({
  value,
  label,
  hint,
  accent,
}: {
  value: number;
  label: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricTop}>
        <View
          style={[styles.metricDot, { backgroundColor: accent ?? colors.accent }]}
        />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

export default function SuperadminDashboardScreen() {
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const [recent, setRecent] = useState<TenantListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("tenants")
      .select(TENANT_COLUMNS)
      .order("created_at", { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setSummary(summarizeTenants([]));
      return;
    }

    const rows = (data ?? []) as TenantListRow[];
    setError(null);
    setSummary(summarizeTenants(rows));
    setRecent(rows.slice(0, RECENT_LIMIT));
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  if (summary === null)
    return <LoadingState fullScreen message="Loading platform…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const liveShare =
    summary.total === 0 ? 0 : Math.round((summary.active / summary.total) * 100);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      <ScreenHeader
        eyebrow="Platform"
        title="Overview"
        subtitle={`${pluralize(summary.total, "restaurant")} on WebNegosyo`}
      >
        {/* Headline metric lives in the header so the first thing read is the
            health of the platform, not a grid of equal-weight numbers. */}
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.heroValue}>{summary.active}</Text>
            <Text style={styles.heroLabel}>Live right now</Text>
          </View>
          <View style={styles.heroMeter}>
            <View style={styles.heroTrack}>
              <View style={[styles.heroFill, { width: `${liveShare}%` }]} />
            </View>
            <Text style={styles.heroMeterText}>{liveShare}% of all stores</Text>
          </View>
        </View>
      </ScreenHeader>

      <View style={styles.body}>
        <View style={styles.metricRow}>
          <MetricTile
            value={summary.total}
            label="Restaurants"
            hint={
              summary.inactive > 0 ? `${summary.inactive} inactive` : "All active"
            }
          />
          <MetricTile
            value={summary.withApp}
            label="Mobile app"
            accent={colors.warning}
            hint="app_enabled"
          />
        </View>
        <View style={styles.metricRow}>
          <MetricTile
            value={summary.withConvex}
            label="On Convex"
            accent={colors.success}
            hint="Real-time orders"
          />
          <MetricTile
            value={summary.inactive}
            label="Inactive"
            accent={colors.textTertiary}
            hint="Not accepting orders"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recently added</Text>
          <TouchableOpacity
            onPress={() => router.push("/(superadmin)/tenants" as Href)}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.sectionAction}>See all ›</Text>
          </TouchableOpacity>
        </View>

        {recent.length === 0 ? (
          <EmptyState message="No restaurants yet" />
        ) : (
          <View style={styles.list}>
            {recent.map((tenant, index) => (
              <TouchableOpacity
                key={tenant.id}
                style={[styles.row, index > 0 && styles.rowDivided]}
                onPress={() =>
                  router.push(`/(superadmin)/tenant/${tenant.id}` as Href)
                }
                activeOpacity={0.7}
              >
                <Monogram name={tenant.name} seed={tenant.id} size={38} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {tenant.name}
                  </Text>
                  <Text style={styles.rowSlug}>/{tenant.slug}</Text>
                </View>
                {!tenant.is_active ? (
                  <View style={styles.rowFlag}>
                    <Text style={styles.rowFlagText}>Inactive</Text>
                  </View>
                ) : null}
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl * 2 },
  body: { padding: spacing.lg, gap: spacing.md },

  heroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  heroValue: {
    fontSize: 44,
    fontWeight: "800",
    color: colors.heroInkText,
    lineHeight: 48,
  },
  heroLabel: { ...typography.caption, color: colors.heroInkMuted },
  heroMeter: { flex: 1, gap: spacing.xs, paddingBottom: spacing.xs },
  heroTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: "rgba(253,251,247,0.16)",
    overflow: "hidden",
  },
  heroFill: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.warning,
  },
  heroMeterText: { ...typography.small, color: colors.heroInkMuted },

  metricRow: { flexDirection: "row", gap: spacing.md },
  metric: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 2,
    ...shadow.sm,
  },
  metricTop: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  metricDot: { width: 6, height: 6, borderRadius: radius.full },
  metricLabel: { ...typography.eyebrow, color: colors.textSecondary },
  metricValue: { ...typography.title, color: colors.textPrimary },
  metricHint: { ...typography.small, color: colors.textTertiary },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  sectionTitle: { ...typography.heading, color: colors.textPrimary },
  sectionAction: { ...typography.caption, color: colors.accent, fontWeight: "700" },

  list: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.separator },
  rowText: { flex: 1, gap: 1 },
  rowName: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  rowSlug: { ...typography.small, color: colors.textTertiary },
  rowFlag: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  rowFlagText: { ...typography.small, color: colors.textSecondary, fontWeight: "700" },
  chevron: { fontSize: 20, color: colors.textTertiary },
});

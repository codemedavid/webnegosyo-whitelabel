import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { supabase } from "../../lib/supabase";
import {
  summarizeTenants,
  type TenantListRow,
  type TenantSummary,
} from "../../lib/tenant-list";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { colors, typography, spacing } from "../../theme/colors";

const TENANT_COLUMNS =
  "id, slug, name, is_active, convex_deployment_url, menu_engineering_enabled, bundles_enabled, app_enabled, lalamove_enabled";

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
    setRecent(rows.slice(0, 5));
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  if (summary === null) return <LoadingState fullScreen message="Loading platform…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      <Text style={styles.eyebrow}>Platform</Text>
      <Text style={styles.title}>Overview</Text>

      <View style={styles.statRow}>
        <StatCard value={summary.total} label="Restaurants" />
        <StatCard value={summary.active} label="Active" />
      </View>
      <View style={styles.statRow}>
        <StatCard
          value={summary.withApp}
          label="Mobile App"
          hint={`${summary.inactive} inactive`}
        />
        <StatCard value={summary.withConvex} label="On Convex" />
      </View>

      <Text style={styles.sectionTitle}>Recently added</Text>
      {recent.map((tenant) => (
        <View key={tenant.id} style={styles.row}>
          <Text style={styles.rowName}>{tenant.name}</Text>
          <Text style={styles.rowSlug}>/{tenant.slug}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.title, color: colors.textPrimary },
  statRow: { flexDirection: "row", gap: spacing.md },
  sectionTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  rowName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  rowSlug: { ...typography.small, color: colors.textTertiary },
});

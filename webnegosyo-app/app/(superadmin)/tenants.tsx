import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { router, type Href } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/auth-store";
import { enterTenant } from "../../lib/impersonation";
import {
  FEATURE_FILTERS,
  filterTenants,
  tenantFeatureLabels,
  type TenantFeatureKey,
  type TenantListRow,
  type TenantStatusFilter,
} from "../../lib/tenant-list";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { colors, typography, radius, spacing, shadow } from "../../theme/colors";

const TENANT_COLUMNS =
  "id, slug, name, is_active, convex_deployment_url, menu_engineering_enabled, bundles_enabled, app_enabled, lalamove_enabled";

const STATUS_FILTERS: readonly { key: TenantStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

export default function TenantsScreen() {
  const [tenants, setTenants] = useState<TenantListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TenantStatusFilter>("all");
  const [feature, setFeature] = useState<TenantFeatureKey | undefined>();

  const load = useCallback(async () => {
    // RLS grants a superadmin platform-wide reads, so this needs no server hop.
    const { data, error: queryError } = await supabase
      .from("tenants")
      .select(TENANT_COLUMNS)
      .order("name");

    if (queryError) {
      setError(queryError.message);
      setTenants([]);
      return;
    }
    setError(null);
    setTenants((data ?? []) as TenantListRow[]);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const visible = useMemo(
    () => filterTenants(tenants ?? [], { query, status, feature }),
    [tenants, query, status, feature]
  );

  const handleOpenAsMerchant = (tenant: TenantListRow) => {
    const state = useAuthStore.getState();
    useAuthStore.getState().setAuth(
      enterTenant(state, {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        convex_deployment_url: tenant.convex_deployment_url,
      })
    );
    router.replace("/(main)/dashboard");
  };

  if (tenants === null) return <LoadingState fullScreen message="Loading restaurants…" />;
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
      <Text style={styles.title}>Restaurants</Text>

      <TextInput
        style={styles.search}
        placeholder="Search by name or slug"
        placeholderTextColor={colors.textTertiary}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, status === f.key && styles.chipActive]}
              onPress={() => setStatus(f.key)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.chipText,
                  status === f.key && styles.chipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {FEATURE_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, feature === f.key && styles.chipActive]}
              onPress={() =>
                setFeature(feature === f.key ? undefined : f.key)
              }
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.chipText,
                  feature === f.key && styles.chipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.count}>
        {visible.length} of {tenants.length}
      </Text>

      {visible.length === 0 ? (
        <EmptyState message="No restaurants match these filters" />
      ) : (
        visible.map((tenant) => (
          <View key={tenant.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeading}>
                <Text style={styles.cardTitle}>{tenant.name}</Text>
                <Text style={styles.cardSlug}>/{tenant.slug}</Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  tenant.is_active ? styles.statusOn : styles.statusOff,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    tenant.is_active ? styles.statusTextOn : styles.statusTextOff,
                  ]}
                >
                  {tenant.is_active ? "Active" : "Inactive"}
                </Text>
              </View>
            </View>

            {tenantFeatureLabels(tenant).length > 0 ? (
              <View style={styles.featureRow}>
                {tenantFeatureLabels(tenant).map((label) => (
                  <View key={label} style={styles.featureChip}>
                    <Text style={styles.featureText}>{label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.manageButton}
                onPress={() =>
                  router.push(`/(superadmin)/tenant/${tenant.id}` as Href)
                }
                activeOpacity={0.8}
              >
                <Text style={styles.manageButtonText}>Manage</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.openButton}
                onPress={() => handleOpenAsMerchant(tenant)}
                activeOpacity={0.8}
              >
                <Text style={styles.openButtonText}>Open as merchant</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.title, color: colors.textPrimary },
  search: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  chipTextActive: { color: colors.textOnDark },
  count: { ...typography.small, color: colors.textTertiary },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardHeading: { flex: 1 },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  cardSlug: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusOn: { backgroundColor: colors.successLight },
  statusOff: { backgroundColor: colors.dangerLight },
  statusText: { ...typography.small, fontWeight: "700" },
  statusTextOn: { color: colors.success },
  statusTextOff: { color: colors.danger },
  featureRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  featureChip: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  featureText: { ...typography.small, color: colors.textSecondary },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  manageButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
  },
  manageButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  openButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: "center",
  },
  openButtonText: { color: colors.textOnDark, fontSize: 15, fontWeight: "700" },
});

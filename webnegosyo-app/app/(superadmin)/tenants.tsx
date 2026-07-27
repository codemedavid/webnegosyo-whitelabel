import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
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
import { pluralize, tenantStatusTone } from "../../lib/superadmin-ui";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { ScreenHeader } from "../../components/superadmin/ScreenHeader";
import { SearchField } from "../../components/superadmin/SearchField";
import { FilterChips } from "../../components/superadmin/FilterChips";
import { TenantLogo } from "../../components/superadmin/TenantLogo";
import { Pill } from "../../components/superadmin/Pill";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

const TENANT_COLUMNS =
  "id, slug, name, is_active, logo_url, convex_deployment_url, order_backend, menu_engineering_enabled, bundles_enabled, app_enabled, lalamove_enabled";

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

  const statusOptions = useMemo(() => {
    const rows = tenants ?? [];
    const counts: Record<TenantStatusFilter, number> = {
      all: rows.length,
      active: rows.filter((t) => t.is_active).length,
      inactive: rows.filter((t) => !t.is_active).length,
    };
    return STATUS_FILTERS.map((f) => ({ ...f, count: counts[f.key] }));
  }, [tenants]);

  const handleOpenAsMerchant = (tenant: TenantListRow) => {
    const state = useAuthStore.getState();
    useAuthStore.getState().setAuth(
      enterTenant(state, {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        convex_deployment_url: tenant.convex_deployment_url,
        order_backend: tenant.order_backend,
      })
    );
    router.replace("/(main)/dashboard");
  };

  const handleClearFilters = () => {
    setQuery("");
    setStatus("all");
    setFeature(undefined);
  };

  if (tenants === null)
    return <LoadingState fullScreen message="Loading restaurants…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const isFiltered = query !== "" || status !== "all" || feature !== undefined;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      <ScreenHeader
        eyebrow="Platform"
        title="Restaurants"
        subtitle={
          isFiltered
            ? `${visible.length} of ${tenants.length} shown`
            : pluralize(tenants.length, "restaurant")
        }
      />

      <View style={styles.body}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or slug"
        />

        <FilterChips
          caption="Status"
          options={statusOptions}
          selected={status}
          onSelect={setStatus}
        />

        <FilterChips
          caption="Feature"
          options={FEATURE_FILTERS}
          selected={feature}
          // Tapping the active feature clears it — these are toggles, not a
          // radio group, so there must be a way back to "any feature".
          onSelect={(key) => setFeature(feature === key ? undefined : key)}
        />

        {visible.length === 0 ? (
          <View style={styles.emptyBlock}>
            <EmptyState message="No restaurants match these filters" />
            {isFiltered ? (
              <TouchableOpacity
                onPress={handleClearFilters}
                activeOpacity={0.8}
                style={styles.clearFilters}
              >
                <Text style={styles.clearFiltersText}>Clear filters</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          visible.map((tenant) => {
            const tone = tenantStatusTone(tenant.is_active);
            const features = tenantFeatureLabels(tenant);
            return (
              <View key={tenant.id} style={styles.card}>
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() =>
                    router.push(`/(superadmin)/tenant/${tenant.id}` as Href)
                  }
                  activeOpacity={0.7}
                >
                  <TenantLogo
                    name={tenant.name}
                    logoUrl={tenant.logo_url}
                    seed={tenant.id}
                  />
                  <View style={styles.cardHeading}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {tenant.name}
                    </Text>
                    <Text style={styles.cardSlug}>/{tenant.slug}</Text>
                  </View>
                  <Pill label={tenant.is_active ? "Active" : "Inactive"} tone={tone} />
                </TouchableOpacity>

                {features.length > 0 ? (
                  <View style={styles.featureRow}>
                    {features.map((label) => (
                      <View key={label} style={styles.featureChip}>
                        <Text style={styles.featureText}>{label}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noFeatures}>No optional features enabled</Text>
                )}

                <View style={styles.actionRow}>
                  {/* Manage is the primary action: editing is the common task,
                      while impersonation is deliberately the quieter one. */}
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() =>
                      router.push(`/(superadmin)/tenant/${tenant.id}` as Href)
                    }
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryButtonText}>Manage</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => handleOpenAsMerchant(tenant)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.secondaryButtonText}>Open store ↗</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl * 2 },
  body: { padding: spacing.lg, gap: spacing.md },

  emptyBlock: { alignItems: "center", gap: spacing.sm },
  clearFilters: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  clearFiltersText: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardHeading: { flex: 1, gap: 1 },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  cardSlug: { ...typography.small, color: colors.textTertiary },

  featureRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  featureChip: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  featureText: { ...typography.small, color: colors.textSecondary, fontWeight: "600" },
  noFeatures: { ...typography.small, color: colors.textTertiary, fontStyle: "italic" },

  actionRow: { flexDirection: "row", gap: spacing.sm },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.textOnDark, fontSize: 15, fontWeight: "700" },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
  },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
});

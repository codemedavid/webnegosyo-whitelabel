import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Switch,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { FunctionReference } from "convex/server";
import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { useSafeQuery } from "../../lib/hooks";
import { notifyMenuRevalidate } from "../../lib/menu-revalidate";
import { productHref, NEW_PRODUCT_ID } from "../../lib/navigation";
import { ScreenHeader } from "../../components/ScreenHeader";
import { IconButton } from "../../components/IconButton";
import { Icon } from "../../components/Icon";
import type { Category } from "../../lib/products";
import {
  describeMenuAvailability,
  MENU_AVAILABILITY_LABEL,
} from "../../lib/menu-availability";
import {
  toggleProductAvailability,
  calculateMargin,
  type Product,
} from "../../lib/products";
import { useCategories, useMenuCatalogCache, useProducts } from "../../lib/query/use-products";
import { useRefetchOnScreenFocus } from "../../lib/query/use-screen-focus";
import { PLATFORM_STALE_MS } from "../../lib/query/query-client";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";

const getAllCostsRef = "productCosts:getAllCosts" as unknown as FunctionReference<"query">;

/** Never an empty list after a failed read: "no products" is a claim. */
const LOAD_ERROR = "Could not load products. Pull down to try again.";

const NO_PRODUCTS: Product[] = [];
const NO_CATEGORIES: Category[] = [];

interface ProductCost {
  menuItemId: string;
  costPrice: number;
}

export default function ProductManagementScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);

  // The shared, cached copies of `listProducts` and `listCategories`. This is
  // a TAB: it mounts once and is never unmounted, so its own mount-time read
  // would be the ONLY one of the launch — a dish added in the editor, or by
  // someone on the web admin, stayed invisible until the app was force-quit.
  const productsResource = useProducts(tenantId);
  const categoriesResource = useCategories(tenantId);
  const { patchProductAvailability, invalidate: invalidateCatalog } = useMenuCatalogCache();

  const products = productsResource.data ?? NO_PRODUCTS;
  const categories = categoriesResource.data ?? NO_CATEGORIES;
  const isLoading = productsResource.isLoading || categoriesResource.isLoading;
  const error =
    productsResource.error || categoriesResource.error ? LOAD_ERROR : null;

  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: costs } = useSafeQuery<ProductCost[]>(getAllCostsRef, {});
  const costByItem = new Map((costs ?? []).map((c) => [c.menuItemId, c.costPrice]));

  const { refetch: refetchProducts } = productsResource;
  const { refetch: refetchCategories } = categoriesResource;
  const load = useCallback(async () => {
    await Promise.all([refetchProducts(), refetchCategories()]);
  }, [refetchProducts, refetchCategories]);

  // Coming back to the tab stands in for the mount this screen never gets
  // again — and only when the cache is actually stale, so ordinary tab
  // switching is not a round trip.
  const isBusy = isLoading || productsResource.isRefetching || categoriesResource.isRefetching;
  const dataUpdatedAt = Math.min(
    productsResource.dataUpdatedAt,
    categoriesResource.dataUpdatedAt,
  );
  useRefetchOnScreenFocus({
    enabled: !!tenantId,
    dataUpdatedAt,
    staleMs: PLATFORM_STALE_MS,
    isFetching: isBusy,
    refetch: load,
  });

  const onRefresh = useCallback(
    () => refreshWithMinSpinner([load], setRefreshing),
    [load],
  );

  const handleToggleAvailability = async (product: Product) => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    if (!tenantId) return;
    const nextAvailable = !product.is_available;
    const rollback = patchProductAvailability(tenantId, product.id, nextAvailable);
    try {
      await toggleProductAvailability(product.id, tenantId, nextAvailable);
      // The register sells from its own cached copy: 86'ing a dish here has to
      // reach it, or the cashier keeps ringing up something the kitchen pulled.
      void invalidateCatalog(tenantId);
      if (tenantSlug) void notifyMenuRevalidate(tenantId, tenantSlug);
    } catch {
      rollback();
      Alert.alert("Error", "Could not update availability.");
    }
  };

  const handleCreate = () => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    router.push(productHref(NEW_PRODUCT_ID));
  };

  const filtered = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory = categoryFilter === "all" || p.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Products"
        subtitle="Create, edit, and price your menu"
        actions={
          <IconButton icon="plus" label="Add product" tone="primary" onPress={handleCreate} />
        }
      >
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search products"
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search products by name"
          />
        </View>
      </ScreenHeader>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={[styles.filterPill, categoryFilter === "all" && styles.filterPillActive]}
          onPress={() => setCategoryFilter("all")}
        >
          <Text
            style={[styles.filterPillText, categoryFilter === "all" && styles.filterPillTextActive]}
          >
            All
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.filterPill, categoryFilter === cat.id && styles.filterPillActive]}
            onPress={() => setCategoryFilter(cat.id)}
          >
            <Text
              style={[
                styles.filterPillText,
                categoryFilter === cat.id && styles.filterPillTextActive,
              ]}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {isLoading ? (
          <LoadingState message="Loading products..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState message="No products match your filters." />
        ) : (
          filtered.map((product) => {
            const costPrice = costByItem.get(product.id) ?? null;
            const margin = calculateMargin(product.price, costPrice);
            return (
              <TouchableOpacity
                key={product.id}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => router.push(productHref(product.id))}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${product.name}`}
              >
                <View style={styles.rowHeader}>
                  <Text style={styles.name} numberOfLines={1}>
                    {product.name}
                  </Text>
                  <Switch
                    value={product.is_available}
                    onValueChange={() => handleToggleAvailability(product)}
                    trackColor={{ false: colors.separator, true: colors.success }}
                  />
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.price}>{formatPeso(product.price)}</Text>
                  {/*
                    Only when the system pulled the dish, never when the
                    merchant switched it off — telling those two apart is the
                    entire reason `auto_disabled_at` exists.
                  */}
                  {describeMenuAvailability(product) === 'auto-hidden' ? (
                    <View style={[styles.marginBadge, { backgroundColor: colors.dangerLight }]}>
                      <Text style={[styles.marginBadgeText, { color: colors.danger }]}>
                        {MENU_AVAILABILITY_LABEL['auto-hidden']}
                      </Text>
                    </View>
                  ) : null}
                  {margin ? (
                    <View
                      style={[
                        styles.marginBadge,
                        { backgroundColor: margin.marginPercent && margin.marginPercent < 0 ? colors.dangerLight : colors.successLight },
                      ]}
                    >
                      <Text
                        style={[
                          styles.marginBadgeText,
                          { color: margin.marginPercent && margin.marginPercent < 0 ? colors.danger : colors.success },
                        ]}
                      >
                        {margin.marginPercent === null ? "—" : `${margin.marginPercent.toFixed(0)}% margin`}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.setCostHint}>Set cost in Products tab</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.sm, alignItems: "center" },
  filterPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterPillText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  filterPillTextActive: { color: colors.textOnDark },
  list: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.sm },
  row: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.sm },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  price: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  marginBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  marginBadgeText: { fontSize: 11, fontWeight: "700" },
  setCostHint: { ...typography.small, color: colors.textTertiary },
});

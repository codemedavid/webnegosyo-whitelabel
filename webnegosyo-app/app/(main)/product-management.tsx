import React, { useCallback, useEffect, useState } from "react";
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
import {
  listProducts,
  listCategories,
  toggleProductAvailability,
  calculateMargin,
  type Product,
  type Category,
} from "../../lib/products";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";

const getAllCostsRef = "productCosts:getAllCosts" as unknown as FunctionReference<"query">;

interface ProductCost {
  menuItemId: string;
  costPrice: number;
}

export default function ProductManagementScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: costs } = useSafeQuery<ProductCost[]>(getAllCostsRef, {});
  const costByItem = new Map((costs ?? []).map((c) => [c.menuItemId, c.costPrice]));

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);
      const [productsResult, categoriesResult] = await Promise.all([
        listProducts(tenantId),
        listCategories(tenantId),
      ]);
      setProducts(productsResult);
      setCategories(categoriesResult);
    } catch {
      setError("Could not load products. Pull down to try again.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleToggleAvailability = async (product: Product) => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    const nextAvailable = !product.is_available;
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, is_available: nextAvailable } : p))
    );
    try {
      await toggleProductAvailability(product.id, tenantId as string, nextAvailable);
      if (tenantSlug) void notifyMenuRevalidate(tenantId as string, tenantSlug);
    } catch {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_available: product.is_available } : p))
      );
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
      <View style={styles.headerWrap}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Manage Products</Text>
            <Text style={styles.subtitle}>Create, edit, and price your menu</Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleCreate}
            accessibilityRole="button"
            accessibilityLabel="Add new product"
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search products"
          placeholderTextColor={colors.textTertiary}
        />
      </View>

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
          <ErrorState message={error} onRetry={load} />
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
  headerWrap: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  addButtonText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
  searchInput: {
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
  },
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

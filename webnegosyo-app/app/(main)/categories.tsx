/**
 * The store's menu sections: what they are called, what order they appear in,
 * and what icon the customer sees beside each one.
 *
 * Arranging is the operation that matters most here. `order` is what the
 * storefront, the customer app and the register all sort by, so a move is a
 * write, not a local shuffle — and it is followed by re-reading the shared
 * catalog (so the product screens and the register agree) and by asking the
 * web app to rebuild the public menu (which is ISR-cached and would otherwise
 * keep serving the old arrangement until its TTL ran out).
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Switch,
  Alert,
} from "react-native";
import { router } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { notifyMenuRevalidate } from "../../lib/menu-revalidate";
import { categoryHref, NEW_CATEGORY_ID } from "../../lib/navigation";
import {
  moveCategory,
  reorderCategories,
  toggleCategoryActive,
  type ManagedCategory,
  type MoveDirection,
} from "../../lib/categories";
import { useCategories, useMenuCatalogCache, useProducts } from "../../lib/query/use-products";
import { useRefetchOnScreenFocus } from "../../lib/query/use-screen-focus";
import { PLATFORM_STALE_MS } from "../../lib/query/query-client";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { IconButton } from "../../components/IconButton";
import { Icon } from "../../components/Icon";
import { CategoryIcon } from "../../components/CategoryIcon";

/** Never an empty list after a failed read: "no categories" is a claim. */
const LOAD_ERROR = "Could not load categories. Pull down to try again.";

const NO_CATEGORIES: ManagedCategory[] = [];
const ICON_SIZE = 22;
const MOVE_CHEVRON_SIZE = 16;

export default function CategoriesScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);

  // This is a TAB: it mounts once and is never unmounted, so reading through
  // the shared cache is what lets a category added in the editor — or on the
  // web admin — show up without force-quitting the app.
  const categoriesResource = useCategories(tenantId);
  const productsResource = useProducts(tenantId);
  const { invalidate: invalidateCatalog } = useMenuCatalogCache();

  const loaded = categoriesResource.data ?? NO_CATEGORIES;
  const products = productsResource.data ?? [];

  /**
   * The arrangement as the merchant sees it mid-move.
   *
   * A move writes several rows; until they land, the cached list still holds
   * the old order. Holding the moved arrangement locally is what keeps the row
   * from snapping back under the merchant's thumb.
   */
  const [pending, setPending] = useState<ManagedCategory[] | null>(null);
  const categories = pending ?? loaded;

  const [refreshing, setRefreshing] = useState(false);

  const { refetch: refetchCategories } = categoriesResource;
  const load = useCallback(async () => {
    setPending(null);
    await refetchCategories();
  }, [refetchCategories]);

  const isBusy = categoriesResource.isLoading || categoriesResource.isRefetching;
  useRefetchOnScreenFocus({
    enabled: !!tenantId,
    dataUpdatedAt: categoriesResource.dataUpdatedAt,
    staleMs: PLATFORM_STALE_MS,
    isFetching: isBusy,
    refetch: load,
  });

  const onRefresh = useCallback(
    () => refreshWithMinSpinner([load], setRefreshing),
    [load],
  );

  /** True when this session may not write; alerts the merchant if so. */
  const blockedByDemo = (): boolean => {
    if (!useAuthStore.getState().isDemo) return false;
    Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
    return true;
  };

  /** Everything downstream of a category write: the caches, then the storefront. */
  const publishMenuChange = () => {
    if (!tenantId) return;
    void invalidateCatalog(tenantId);
    if (tenantSlug) void notifyMenuRevalidate(tenantId, tenantSlug);
  };

  const handleMove = async (category: ManagedCategory, direction: MoveDirection) => {
    if (blockedByDemo() || !tenantId) return;

    const previous = categories;
    const reordered = moveCategory(categories, category.id, direction);
    setPending(reordered);
    try {
      await reorderCategories(tenantId, reordered);
      publishMenuChange();
    } catch {
      setPending(previous);
      Alert.alert("Error", "Could not rearrange your menu sections.");
    }
  };

  const handleToggle = async (category: ManagedCategory) => {
    if (blockedByDemo() || !tenantId) return;

    const nextActive = !category.is_active;
    const previous = categories;
    setPending(
      categories.map((c) => (c.id === category.id ? { ...c, is_active: nextActive } : c)),
    );
    try {
      await toggleCategoryActive(category.id, tenantId, nextActive);
      publishMenuChange();
    } catch {
      // A section left showing "on" that is actually hidden means the merchant
      // believes customers can order from a part of the menu they cannot see.
      setPending(previous);
      Alert.alert("Error", "Could not show or hide that section.");
    }
  };

  const handleAdd = () => {
    if (blockedByDemo()) return;
    router.push(categoryHref(NEW_CATEGORY_ID));
  };

  const countIn = (categoryId: string) =>
    products.filter((product) => product.category_id === categoryId).length;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Categories"
        subtitle="Menu sections, their order and icons"
        actions={
          <IconButton icon="plus" label="Add a category" tone="primary" onPress={handleAdd} />
        }
      />

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {categoriesResource.isLoading ? (
          <LoadingState message="Loading categories..." />
        ) : categoriesResource.error ? (
          <ErrorState message={LOAD_ERROR} onRetry={load} />
        ) : categories.length === 0 ? (
          <EmptyState
            icon="list"
            title="No categories yet"
            message="Group your dishes into sections so customers can find them."
            actionLabel="Add a category"
            onAction={handleAdd}
          />
        ) : (
          categories.map((category, index) => (
            <View key={category.id} style={styles.row}>
              <TouchableOpacity
                style={styles.rowMain}
                activeOpacity={0.7}
                onPress={() => router.push(categoryHref(category.id))}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${category.name}`}
              >
                <View style={styles.iconWell}>
                  <CategoryIcon
                    icon={category.icon}
                    color={category.icon_color}
                    size={ICON_SIZE}
                    fallback="placeholder"
                  />
                </View>

                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {category.name}
                  </Text>
                  <View style={styles.badgeRow}>
                    <Text style={styles.count}>
                      {countIn(category.id)} product
                      {countIn(category.id) === 1 ? "" : "s"}
                    </Text>
                    {!category.is_active && (
                      <View style={[styles.badge, styles.badgeWarning]}>
                        <Text style={[styles.badgeText, styles.badgeWarningText]}>
                          Hidden
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>

              <View style={styles.rowControls}>
                <Switch
                  value={category.is_active}
                  onValueChange={() => handleToggle(category)}
                  trackColor={{ false: colors.separator, true: colors.success }}
                  accessibilityLabel={`${category.name} shown on the menu`}
                />
                <View style={styles.moveRow}>
                  <TouchableOpacity
                    style={[styles.reorder, index === 0 && styles.reorderDisabled]}
                    disabled={index === 0}
                    onPress={() => handleMove(category, "up")}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${category.name} up`}
                  >
                    <View style={styles.flip}>
                      <Icon
                        name="chevron-down"
                        size={MOVE_CHEVRON_SIZE}
                        color={colors.textPrimary}
                      />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.reorder,
                      index === categories.length - 1 && styles.reorderDisabled,
                    ]}
                    disabled={index === categories.length - 1}
                    onPress={() => handleMove(category, "down")}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${category.name} down`}
                  >
                    <Icon
                      name="chevron-down"
                      size={MOVE_CHEVRON_SIZE}
                      color={colors.textPrimary}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl * 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  count: { ...typography.caption, color: colors.textSecondary },
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.background,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  badgeWarning: { backgroundColor: colors.warningLight },
  badgeWarningText: { color: colors.warning },
  rowControls: { alignItems: "center", gap: spacing.sm },
  moveRow: { flexDirection: "row", gap: spacing.xs },
  reorder: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  reorderDisabled: { opacity: 0.3 },
  flip: { transform: [{ rotate: "180deg" }] },
});

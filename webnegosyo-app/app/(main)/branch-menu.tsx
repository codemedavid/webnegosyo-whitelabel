import React, { useCallback, useMemo, useState } from "react";
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

import { router, useFocusEffect } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { notifyMenuRevalidate } from "../../lib/menu-revalidate";
import { productHref, NEW_PRODUCT_ID } from "../../lib/navigation";
import type { Product } from "../../lib/products";
import { useOutlets } from "../../lib/use-outlets";
import { setBranchListing } from "../../lib/branch-menu-service";
import { useMenuCatalog, useMenuCatalogCache } from "../../lib/query/use-products";
import { PLATFORM_STALE_MS } from "../../lib/query/query-client";
import { shouldRefetchOnFocus } from "../../lib/query/use-screen-focus";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import {
  buildBranchProductRows,
  buildOutletMenuIndex,
  filterBranchProducts,
  type BranchProductRow,
} from "../../lib/branch-menu";
import { formatPeso } from "../../lib/format";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { IconButton } from "../../components/IconButton";
import { Icon } from "../../components/Icon";

const ALL_BRANCHES = "all";
const ALL_CATEGORIES = "all";

const LOAD_ERROR = "Could not load your branch menus. Pull down to try again.";

/**
 * Which branches carry which dish — the owner's cross-branch menu.
 *
 * The list is the STORE-WIDE menu with each branch's answer under it, not a
 * list of the dishes that already differ: an owner opens this asking "does
 * Pasig still sell the adobo", and a screen showing only the exceptions hides
 * the dish they came to look for.
 *
 * The switch is "carried here", not "sold out here". They live in the same row
 * in the database and read almost the same in English, but one is a menu
 * decision the owner makes from here and the other is a shift decision the
 * branch makes on the Products tab, so only one of them is a switch and the
 * other is a badge.
 */
export default function BranchMenuScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);

  const {
    outlets,
    isLoading: outletsLoading,
    error: outletsError,
    reload,
    refetch: refetchOutlets,
  } = useOutlets();

  // The shared, cached copies of `listProducts`, `listCategories` and
  // `listBranchMenuOverrides`: one read per store however many screens ask,
  // and the editor's saves invalidate them so this list is never behind.
  const catalog = useMenuCatalog(tenantId);
  const { products, categories, overrides } = catalog;
  const { patchBranchListing, invalidate: invalidateCatalog } = useMenuCatalogCache();

  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>(ALL_BRANCHES);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Never an empty list: "no branch differences" is a claim, and making it
  // after a failed read invites switching a dish back on that was never off.
  const error = catalog.error ? LOAD_ERROR : null;

  // The editor is a separate screen, so a product added or renamed there comes
  // back to a list that would otherwise still show the old menu — and an owner
  // who cannot see the dish they just added adds it a second time. The tab
  // never unmounts, so focus stands in for mount; only when the cache is stale.
  const { refetch: refetchCatalog, dataUpdatedAt, isLoading, isRefetching } = catalog;
  useFocusEffect(
    useCallback(() => {
      if (!tenantId || isLoading || isRefetching) return;
      if (!shouldRefetchOnFocus({ dataUpdatedAt, staleMs: PLATFORM_STALE_MS, nowMs: Date.now() })) {
        return;
      }
      void refetchCatalog();
      // Read at focus time; re-subscribing on every landed read is not needed.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, refetchCatalog]),
  );

  const onRefresh = useCallback(
    () => refreshWithMinSpinner([refetchOutlets, refetchCatalog], setRefreshing),
    [refetchOutlets, refetchCatalog],
  );

  const branches = useMemo(
    () =>
      branchFilter === ALL_BRANCHES
        ? outlets
        : outlets.filter((outlet) => outlet.id === branchFilter),
    [outlets, branchFilter],
  );

  const rows = useMemo(() => {
    const visible = filterBranchProducts(products, { search, categoryId: categoryFilter });

    return buildBranchProductRows(visible, branches, buildOutletMenuIndex(overrides));
  }, [products, branches, overrides, search, categoryFilter]);

  const handleToggle = async (
    row: BranchProductRow<Product>,
    outletId: string,
    nextListed: boolean,
  ) => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    if (!tenantId) return;

    const key = `${outletId}:${row.product.id}`;

    setSavingKey(key);
    const rollback = patchBranchListing(tenantId, outletId, row.product.id, nextListed);

    try {
      await setBranchListing(tenantId, outletId, row.product.id, nextListed);
      if (tenantSlug) void notifyMenuRevalidate(tenantId, tenantSlug);
      // The register and the product list read the same rows; they learn of
      // the switch here rather than on their next cold start.
      void invalidateCatalog(tenantId);
    } catch {
      // Optimistic and silent is the worst pair here: the owner walks away
      // believing a branch stopped selling a dish it is still selling.
      rollback();
      Alert.alert("Error", "Could not update this branch. Please try again.");
    } finally {
      setSavingKey(null);
    }
  };

  /**
   * Add and edit both go to the Products tab's editor rather than a second
   * form here. The two would share one table and drift apart on validation and
   * the legacy variation columns the customer storefront still reads.
   */
  const handleCreate = () => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    router.push(productHref(NEW_PRODUCT_ID));
  };

  if (outletsError) return <ErrorState message={outletsError} onRetry={reload} />;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Branch products"
        subtitle="Choose what each branch sells"
        actions={
          <IconButton icon="plus" label="Add new product" tone="primary" onPress={handleCreate} />
        }
      >
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search products"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Search products"
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
          style={[styles.filterPill, branchFilter === ALL_BRANCHES && styles.filterPillActive]}
          onPress={() => setBranchFilter(ALL_BRANCHES)}
          accessibilityRole="button"
          accessibilityState={{ selected: branchFilter === ALL_BRANCHES }}
        >
          <Text
            style={[
              styles.filterPillText,
              branchFilter === ALL_BRANCHES && styles.filterPillTextActive,
            ]}
          >
            All branches
          </Text>
        </TouchableOpacity>
        {outlets.map((outlet) => (
          <TouchableOpacity
            key={outlet.id}
            style={[styles.filterPill, branchFilter === outlet.id && styles.filterPillActive]}
            onPress={() => setBranchFilter(outlet.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: branchFilter === outlet.id }}
          >
            <Text
              style={[
                styles.filterPillText,
                branchFilter === outlet.id && styles.filterPillTextActive,
              ]}
            >
              {outlet.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            style={[
              styles.categoryPill,
              categoryFilter === ALL_CATEGORIES && styles.categoryPillActive,
            ]}
            onPress={() => setCategoryFilter(ALL_CATEGORIES)}
            accessibilityRole="button"
            accessibilityState={{ selected: categoryFilter === ALL_CATEGORIES }}
          >
            <Text
              style={[
                styles.categoryPillText,
                categoryFilter === ALL_CATEGORIES && styles.categoryPillTextActive,
              ]}
            >
              All items
            </Text>
          </TouchableOpacity>
          {categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryPill,
                categoryFilter === category.id && styles.categoryPillActive,
              ]}
              onPress={() => setCategoryFilter(category.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: categoryFilter === category.id }}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  categoryFilter === category.id && styles.categoryPillTextActive,
                ]}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {isLoading || outletsLoading ? (
          <LoadingState message="Loading branch menus..." />
        ) : error ? (
          <ErrorState message={error} onRetry={refetchCatalog} />
        ) : outlets.length === 0 ? (
          <EmptyState message="No branches yet. Add one to choose what it sells." />
        ) : rows.length === 0 ? (
          <EmptyState message="No products match your search." />
        ) : (
          rows.map((row) => {
            const isExpanded = expandedId === row.product.id;
            return (
              <View key={row.product.id} style={styles.row}>
                {/* Two jobs, two targets. Sharing one would send the owner to
                    the editor every time they meant to open the branches. */}
                <View style={styles.rowHeader}>
                  <TouchableOpacity
                    style={styles.rowHeaderText}
                    activeOpacity={0.7}
                    onPress={() => setExpandedId(isExpanded ? null : row.product.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Branches selling ${row.product.name}`}
                    accessibilityState={{ expanded: isExpanded }}
                  >
                    <Text style={styles.name} numberOfLines={1}>
                      {row.product.name}
                    </Text>
                    <View style={styles.rowHeaderMeta}>
                      <Text style={styles.price}>{formatPeso(row.product.price)}</Text>
                      <Text style={styles.branchCount}>
                        · {row.listedCount} of {row.branches.length} branches
                      </Text>
                      <Text style={styles.chevron}>{isExpanded ? "▾" : "▸"}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editButton}
                    activeOpacity={0.7}
                    onPress={() => router.push(productHref(row.product.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${row.product.name}`}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                </View>

                {row.label ? (
                  <Text
                    style={[
                      styles.summary,
                      row.label.tone === "warning" && styles.summaryWarning,
                    ]}
                  >
                    {row.label.detail}
                  </Text>
                ) : null}

                {/* A branch cannot un-86 a dish the whole store switched off, so
                    the row says so rather than offering switches that look like
                    they would bring it back. */}
                {row.isOffStoreWide ? (
                  <Text style={styles.storeWideNote}>
                    Switched off for the whole store — turn it back on in Products before a
                    branch can sell it.
                  </Text>
                ) : null}

                {isExpanded
                  ? row.branches.map((cell) => {
                      const key = `${cell.branchId}:${row.product.id}`;
                      return (
                        <View key={cell.branchId} style={styles.branchRow}>
                          <View style={styles.branchText}>
                            <Text style={styles.branchName}>{cell.branchName}</Text>
                            <Text style={styles.branchMeta}>
                              {cell.isListed
                                ? `${formatPeso(cell.price)}${cell.isAvailable ? "" : " · sold out today"}`
                                : "Not on this branch's menu"}
                            </Text>
                          </View>
                          <Switch
                            value={cell.isListed}
                            disabled={savingKey === key}
                            onValueChange={(next) => handleToggle(row, cell.branchId, next)}
                            trackColor={{ false: colors.separator, true: colors.success }}
                            accessibilityLabel={`Sell ${row.product.name} at ${cell.branchName}`}
                          />
                        </View>
                      );
                    })
                  : null}
              </View>
            );
          })
        )}

        <Text style={styles.note}>
          Switching a product off here takes it off that branch&apos;s menu. It is not the same
          as marking it sold out for the day — a branch does that from its own Products tab.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchRow: {
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
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 0 },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    alignItems: "center",
  },
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
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowHeaderText: { flex: 1 },
  rowHeaderMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  price: { ...typography.small, color: colors.textSecondary },
  editButton: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  editButtonText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
  },
  categoryPillActive: { backgroundColor: colors.textPrimary },
  categoryPillText: { ...typography.small, color: colors.textSecondary, fontWeight: "500" },
  categoryPillTextActive: { color: colors.textOnDark },
  branchCount: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  chevron: { ...typography.caption, color: colors.textTertiary },
  summary: { ...typography.small, color: colors.textSecondary, marginTop: spacing.sm },
  summaryWarning: { color: colors.danger },
  storeWideNote: { ...typography.small, color: colors.danger, marginTop: spacing.sm },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  branchText: { flex: 1 },
  branchName: { ...typography.body, color: colors.textPrimary },
  branchMeta: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  note: { ...typography.small, color: colors.textTertiary, marginTop: spacing.md, lineHeight: 16 },
});

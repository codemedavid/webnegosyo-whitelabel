import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuthStore } from "../../stores/auth-store";
import { usePosCartStore } from "../../stores/pos-cart-store";
import {
  listCategories,
  listProducts,
  sanitizeSearchQuery,
  type Category,
  type Product,
} from "../../lib/products";
import { listOrderTypes, type PosOrderType } from "../../lib/pos-catalog";
import {
  normalizeModifierGroups,
  type ModifierGroup,
  type ModifierSource,
} from "../../lib/modifier-groups";
import { quantityByItem, type PosCartSelection } from "../../lib/pos-cart";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { ModifierSheet } from "../../components/pos/ModifierSheet";
import { CartSheet } from "../../components/pos/CartSheet";
import { ProductTile } from "../../components/pos/ProductTile";
import { EmptyState } from "../../components/EmptyState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";

/** A product whose modifier groups have already been normalized. */
interface RegisterItem {
  product: Product;
  groups: ModifierGroup[];
}

/** Tiles per grid row. Rows are pre-chunked so every column is the same width. */
const COLUMNS = 3;

/** The app has no safe-area provider; every screen pads the notch by hand. */
const TOP_INSET = 60;

/** Rows rendered before the first scroll — roughly two screens' worth. */
const INITIAL_ROWS = 6;

function toRows<T>(items: T[], size: number): T[][] {
  return items.reduce<T[][]>((rows, item, index) => {
    if (index % size === 0) return [...rows, [item]];
    return [...rows.slice(0, -1), [...rows[rows.length - 1], item]];
  }, []);
}

export default function PosScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const convexUrl = useAuthStore((s) => s.convexUrl);

  const lines = usePosCartStore((s) => s.lines);
  const orderTypeId = usePosCartStore((s) => s.orderTypeId);
  const serviceCharge = usePosCartStore((s) => s.serviceCharge);
  const add = usePosCartStore((s) => s.add);
  const setQty = usePosCartStore((s) => s.setQty);
  const reset = usePosCartStore((s) => s.reset);
  const setOrderType = usePosCartStore((s) => s.setOrderType);

  const [items, setItems] = useState<RegisterItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orderTypes, setOrderTypes] = useState<PosOrderType[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<RegisterItem | null>(null);
  const [isCartExpanded, setIsCartExpanded] = useState(false);

  const totals = useMemo(
    () => usePosCartStore.getState().totals(),
    // Recompute whenever the sale changes; `totals()` reads the live store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, serviceCharge],
  );

  const inSale = useMemo(() => quantityByItem(lines), [lines]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load(id: string) {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [products, cats, types] = await Promise.all([
          listProducts(id),
          listCategories(id),
          listOrderTypes(id),
        ]);
        if (cancelled) return;

        setItems(
          products
            .filter((p) => p.is_available)
            .map((product) => ({
              product,
              groups: normalizeModifierGroups(product as unknown as ModifierSource),
            })),
        );
        setCategories(cats);
        setOrderTypes(types);

        // Default to the first order type so the cashier can ring up
        // immediately; they can switch before tendering.
        if (!usePosCartStore.getState().orderTypeId && types.length > 0) {
          setOrderType(types[0].id, types[0].name, types[0].serviceCharge);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Could not load the menu.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load(tenantId);
    return () => {
      cancelled = true;
    };
  }, [tenantId, setOrderType]);

  // Returning from a completed sale must never show the previous cart's state.
  useFocusEffect(
    useCallback(() => {
      setSheetFor(null);
      setIsCartExpanded(false);
    }, []),
  );

  const visibleItems = useMemo(() => {
    const term = sanitizeSearchQuery(search).toLowerCase();
    return items.filter(({ product }) => {
      const inCategory = !activeCategory || product.category_id === activeCategory;
      const matches = !term || product.name.toLowerCase().includes(term);
      return inCategory && matches;
    });
  }, [items, activeCategory, search]);

  const rows = useMemo(() => toRows(visibleItems, COLUMNS), [visibleItems]);

  const addToCart = (item: RegisterItem, selections: PosCartSelection[], quantity: number) => {
    add({
      menuItemId: item.product.id,
      name: item.product.name,
      basePrice: item.product.discounted_price ?? item.product.price,
      quantity,
      selections,
    });
    setSheetFor(null);
  };

  const handleTap = (item: RegisterItem) => {
    // Nothing to configure — straight into the cart, one tap.
    if (item.groups.length === 0) {
      addToCart(item, [], 1);
      return;
    }
    setSheetFor(item);
  };

  if (!convexUrl) {
    return (
      <View style={styles.center}>
        <EmptyState message="POS is not available yet — counter sales are written to this store's real-time order backend, which is not configured. Ask your platform admin to connect it." />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <EmptyState message={`Could not load the menu. ${loadError}`} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <WorkspaceSwitcher />
          <Text style={styles.count}>
            {visibleItems.length} {visibleItems.length === 1 ? "product" : "products"}
          </Text>
        </View>

        <View style={styles.searchRow}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            style={styles.search}
            placeholder="Search products"
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch("")}
              hitSlop={10}
              accessibilityLabel="Clear search"
            >
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.rail}
        contentContainerStyle={styles.railContent}
      >
        <TouchableOpacity
          style={[styles.chip, activeCategory === null && styles.chipActive]}
          onPress={() => setActiveCategory(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: activeCategory === null }}
        >
          <Text style={[styles.chipText, activeCategory === null && styles.chipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {categories.map((category) => {
          const isActive = activeCategory === category.id;
          return (
            <TouchableOpacity
              key={category.id}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => setActiveCategory(category.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {category.name?.trim() || "Uncategorized"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/*
        Virtualized by row: a long menu with a photo per item would otherwise
        mount every tile and decode every image up front. Only the rows near the
        viewport are rendered.
      */}
      <FlatList
        data={rows}
        keyExtractor={(row) => row[0].product.id}
        style={styles.gridScroll}
        contentContainerStyle={styles.grid}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={INITIAL_ROWS}
        maxToRenderPerBatch={INITIAL_ROWS}
        windowSize={7}
        // Detaching offscreen rows reclaims image memory on Android; on iOS it
        // is a known source of blank cells, so it stays off there.
        removeClippedSubviews={Platform.OS === "android"}
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            {row.map((item) => (
              <ProductTile
                key={item.product.id}
                name={item.product.name?.trim() || "Unnamed item"}
                price={item.product.discounted_price ?? item.product.price}
                imageUrl={item.product.image_url}
                quantity={inSale[item.product.id] ?? 0}
                hasOptions={item.groups.length > 0}
                onPress={() => handleTap(item)}
              />
            ))}
            {/* Keep the final row's columns aligned with the rows above it. */}
            {Array.from({ length: COLUMNS - row.length }).map((_, index) => (
              <View key={`filler-${index}`} style={styles.filler} />
            ))}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.noResults}>
            <Text style={styles.noResultsTitle}>Nothing matches</Text>
            <Text style={styles.noResultsBody}>
              {search
                ? `No product named “${search.trim()}” in this category.`
                : "This category has no available products."}
            </Text>
          </View>
        }
      />

      {isCartExpanded && (
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsCartExpanded(false)}
          accessibilityLabel="Collapse the sale"
        />
      )}

      <CartSheet
        lines={lines}
        totals={totals}
        orderTypes={orderTypes}
        orderTypeId={orderTypeId}
        isExpanded={isCartExpanded}
        onToggle={() => setIsCartExpanded((open) => !open)}
        onSelectOrderType={(type) => setOrderType(type.id, type.name, type.serviceCharge)}
        onChangeQty={setQty}
        onClear={() => {
          reset();
          setIsCartExpanded(false);
        }}
        onCharge={() => router.push("/(main)/pos-tender")}
      />

      {sheetFor && (
        <ModifierSheet
          visible
          itemName={sheetFor.product.name}
          basePrice={sheetFor.product.discounted_price ?? sheetFor.product.price}
          groups={sheetFor.groups}
          onCancel={() => setSheetFor(null)}
          onConfirm={(selections, quantity) => addToCart(sheetFor, selections, quantity)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: TOP_INSET,
    paddingBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  count: { ...typography.small, color: colors.textTertiary },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.lg,
  },
  searchGlyph: { fontSize: 17, color: colors.textTertiary },
  search: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  searchClear: { fontSize: 13, color: colors.textSecondary },
  rail: { flexGrow: 0 },
  railContent: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: "600", color: colors.textSecondary },
  chipTextActive: { color: colors.textOnDark },
  gridScroll: { flex: 1 },
  grid: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  row: { flexDirection: "row", gap: spacing.sm },
  filler: { flex: 1 },
  noResults: { alignItems: "center", paddingTop: spacing.xxl * 2, paddingHorizontal: spacing.xl },
  noResultsTitle: { ...typography.heading, color: colors.textPrimary },
  noResultsBody: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(29,24,21,0.35)",
  },
});

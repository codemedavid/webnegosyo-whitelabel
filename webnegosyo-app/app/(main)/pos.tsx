import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { formatPeso } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { ModifierSheet } from "../../components/pos/ModifierSheet";
import { CartPanel } from "../../components/pos/CartPanel";
import { EmptyState } from "../../components/EmptyState";
import type { PosCartSelection } from "../../lib/pos-cart";

/** A product whose modifier groups have already been normalized. */
interface RegisterItem {
  product: Product;
  groups: ModifierGroup[];
}

export default function PosScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const convexUrl = useAuthStore((s) => s.convexUrl);

  const lines = usePosCartStore((s) => s.lines);
  const orderTypeId = usePosCartStore((s) => s.orderTypeId);
  const orderTypeName = usePosCartStore((s) => s.orderTypeName);
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

  const totals = useMemo(
    () => usePosCartStore.getState().totals(),
    // Recompute whenever the sale changes; `totals()` reads the live store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, serviceCharge],
  );

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

  // Returning from a completed sale must never show the previous cart.
  useFocusEffect(
    useCallback(() => {
      setSheetFor(null);
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

  const handleTap = (item: RegisterItem) => {
    // Nothing to configure — straight into the cart, one tap.
    if (item.groups.length === 0) {
      addToCart(item, [], 1);
      return;
    }
    setSheetFor(item);
  };

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
      <View style={styles.topBar}>
        <TextInput
          style={styles.search}
          placeholder="Search products"
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
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
        >
          <Text style={[styles.chipText, activeCategory === null && styles.chipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[styles.chip, activeCategory === category.id && styles.chipActive]}
            onPress={() => setActiveCategory(category.id)}
          >
            <Text
              style={[styles.chipText, activeCategory === category.id && styles.chipTextActive]}
            >
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.grid}>
        {visibleItems.map((item) => (
          <TouchableOpacity
            key={item.product.id}
            style={styles.tile}
            onPress={() => handleTap(item)}
            accessibilityRole="button"
          >
            <Text style={styles.tileName} numberOfLines={2}>
              {item.product.name}
            </Text>
            <Text style={styles.tilePrice}>
              {formatPeso(item.product.discounted_price ?? item.product.price)}
            </Text>
          </TouchableOpacity>
        ))}
        {visibleItems.length === 0 && (
          <Text style={styles.noResults}>No products match this search.</Text>
        )}
      </ScrollView>

      <View style={styles.cartArea}>
        <CartPanel
          lines={lines}
          totals={totals}
          onChangeQty={setQty}
          onClear={reset}
        />
      </View>

      <View style={styles.checkoutBar}>
        <View style={styles.orderTypeRow}>
          {orderTypes.map((type) => (
            <TouchableOpacity
              key={type.id}
              style={[styles.typeChip, orderTypeId === type.id && styles.typeChipActive]}
              onPress={() => setOrderType(type.id, type.name, type.serviceCharge)}
            >
              <Text
                style={[styles.typeText, orderTypeId === type.id && styles.typeTextActive]}
              >
                {type.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.chargeButton, lines.length === 0 && styles.chargeDisabled]}
          disabled={lines.length === 0}
          onPress={() => router.push("/(main)/pos-tender")}
        >
          <Text style={styles.chargeText}>
            Charge {formatPeso(totals.total)}
            {orderTypeName ? `  ·  ${orderTypeName}` : ""}
          </Text>
        </TouchableOpacity>
      </View>

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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  topBar: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.sm },
  search: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  rail: { flexGrow: 0 },
  railContent: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.textOnDark, fontWeight: "700" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  tile: {
    width: "31%",
    minHeight: 88,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    justifyContent: "space-between",
  },
  tileName: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  tilePrice: { ...typography.caption, color: colors.textSecondary },
  noResults: { ...typography.caption, color: colors.textSecondary, padding: spacing.xl },
  cartArea: { maxHeight: 220, borderTopWidth: 1, borderTopColor: colors.separator },
  checkoutBar: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    backgroundColor: colors.card,
    gap: spacing.md,
  },
  orderTypeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  typeChipActive: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  typeText: { ...typography.small, color: colors.textSecondary },
  typeTextActive: { color: colors.accent, fontWeight: "700" },
  chargeButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  chargeDisabled: { backgroundColor: colors.textTertiary },
  chargeText: { ...typography.heading, color: colors.textOnDark },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { filterQueueToScope } from "../../lib/branch-dashboard";
import { useBranchScope } from "../../lib/use-branch-scope";
import { useAuthStore } from "../../stores/auth-store";
import { hasLiveOrderBackend } from "../../lib/order-backend";
import {
  selectIncomingOrders,
  countUnseenIncoming,
  type RealtimeQueue,
  type IncomingOrder,
} from "../../lib/pos-incoming";
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
import { formatPeso } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { ModifierSheet } from "../../components/pos/ModifierSheet";
import { CartSheet } from "../../components/pos/CartSheet";
import { DiscountSheet } from "../../components/pos/DiscountSheet";
import { IncomingOrdersSheet } from "../../components/pos/IncomingOrdersSheet";
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

// TODO: Replace double assertion with a generated Convex function reference once
// codegen is wired into the mobile app (same workaround used across the screens).
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;

function toRows<T>(items: T[], size: number): T[][] {
  return items.reduce<T[][]>((rows, item, index) => {
    if (index % size === 0) return [...rows, [item]];
    return [...rows.slice(0, -1), [...rows[rows.length - 1], item]];
  }, []);
}

export default function PosScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const role = useAuthStore((s) => s.role);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const hasOrderBackend = hasLiveOrderBackend({ convexUrl, orderBackend });

  const lines = usePosCartStore((s) => s.lines);
  const orderTypeId = usePosCartStore((s) => s.orderTypeId);
  const serviceCharge = usePosCartStore((s) => s.serviceCharge);
  const add = usePosCartStore((s) => s.add);
  const setQty = usePosCartStore((s) => s.setQty);
  const reset = usePosCartStore((s) => s.reset);
  const setOrderType = usePosCartStore((s) => s.setOrderType);
  const editContext = usePosCartStore((s) => s.editContext);
  const editWarnings = usePosCartStore((s) => s.editWarnings);
  const endEdit = usePosCartStore((s) => s.endEdit);
  const discount = usePosCartStore((s) => s.discount);
  const applyVoucher = usePosCartStore((s) => s.applyVoucher);
  const checkVoucher = usePosCartStore((s) => s.checkVoucher);
  const removeVoucher = usePosCartStore((s) => s.removeVoucher);
  const setManualDiscount = usePosCartStore((s) => s.setManualDiscount);
  const clearManualDiscount = usePosCartStore((s) => s.clearManualDiscount);
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);

  const [items, setItems] = useState<RegisterItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orderTypes, setOrderTypes] = useState<PosOrderType[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<RegisterItem | null>(null);
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [isIncomingExpanded, setIsIncomingExpanded] = useState(false);

  // Ids the cashier has already been shown. `null` until the first snapshot
  // lands, so a store that is simply busy does not greet them with a badge.
  const seenIncomingRef = useRef<Set<string> | null>(null);
  const [unseenCount, setUnseenCount] = useState(0);

  // The same live queue the dashboard and the ringtone watch, so the backend
  // de-dupes the subscription. Orders from the web land here without a refresh.
  const { data: queue } = useSafeQuery<RealtimeQueue>(getRealtimeQueueRef);
  const scope = useBranchScope();
  // The register only accepts its own branch's incoming orders.
  const incomingOrders = useMemo(
    () =>
      selectIncomingOrders(
        filterQueueToScope(scope, queue as Record<string, IncomingOrder[]> | undefined),
      ),
    [scope, queue],
  );

  const totals = useMemo(
    () => usePosCartStore.getState().totals(),
    // Recompute whenever the sale changes; `totals()` reads the live store.
    // `discount` belongs here too: applying a code changes the total without
    // touching a line, and leaving it out would show the undiscounted amount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, serviceCharge, discount],
  );

  // Priced against the current cart, so a voucher that stops qualifying after
  // a line is voided disappears from the sheet rather than being billed.
  const discountLines = useMemo(
    () => usePosCartStore.getState().sessionDiscount().lines,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, serviceCharge, discount],
  );

  const inSale = useMemo(() => quantityByItem(lines), [lines]);

  // Every judgement about the edit — what it now costs, what is owed, whether
  // it may be saved — comes from `pos-edit-mode.ts`, which is unit tested.
  // Nothing about the money is decided in this file.
  // `discount` is a dependency because applying a code changes the edit's total
  // without touching a line — leaving it out would show the undiscounted bill.
  const edit = useMemo(
    () => usePosCartStore.getState().editTotals(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, editContext, discount],
  );

  // The register rings up the branch it belongs to. A store-wide account (the
  // owner, a single-location merchant) gets the store-wide menu, exactly as
  // before per-branch pricing existed.
  const registerOutletId = scope.kind === "branch" ? scope.outletId : null;

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load(id: string) {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [products, cats, types] = await Promise.all([
          listProducts(id, registerOutletId),
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
  }, [tenantId, setOrderType, registerOutletId]);

  // Returning from a completed sale must never show the previous cart's state.
  useFocusEffect(
    useCallback(() => {
      setSheetFor(null);
      setIsCartExpanded(false);
      setIsIncomingExpanded(false);
    }, []),
  );

  useEffect(() => {
    const ids = new Set(incomingOrders.map((order) => order._id));

    // First snapshot: everything already open is old news to the cashier.
    if (seenIncomingRef.current === null) {
      seenIncomingRef.current = ids;
      return;
    }

    // While the drawer is open the cashier is looking straight at the list, so
    // arrivals are acknowledged on sight instead of piling into a badge.
    if (isIncomingExpanded) {
      seenIncomingRef.current = ids;
      setUnseenCount(0);
      return;
    }

    setUnseenCount(countUnseenIncoming(seenIncomingRef.current, incomingOrders));
  }, [incomingOrders, isIncomingExpanded]);

  // Only one bottom sheet may be open: expanded together they would bury the
  // product grid, and the cashier would lose the thing they came here to tap.
  const toggleIncoming = () => {
    setIsCartExpanded(false);
    setIsIncomingExpanded((open) => !open);
  };

  const toggleCart = () => {
    setIsIncomingExpanded(false);
    setIsCartExpanded((open) => !open);
  };

  const openIncomingOrder = (orderId: string) => {
    setIsIncomingExpanded(false);
    router.push(`/(main)/order/${orderId}`);
  };

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

  if (!hasOrderBackend) {
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
      {edit && editContext && (
        <View style={styles.editBanner}>
          <View style={styles.editBannerMain}>
            <Text style={styles.editBannerTitle}>
              {editContext.mode === "append"
                ? "Adding to a placed order"
                : "Editing a placed order"}
            </Text>
            <Text style={styles.editBannerTotals}>
              {formatPeso(editContext.originalTotal)} → {formatPeso(edit.newTotal)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              endEdit();
              router.back();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Cancel the edit"
          >
            <Text style={styles.editBannerCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {editWarnings.length > 0 && (
        <View style={styles.editWarnings}>
          {editWarnings.map((warning) => (
            <Text key={warning} style={styles.editWarningText}>
              {warning}
            </Text>
          ))}
        </View>
      )}

      {/* The banner already clears the notch, so the header must not re-pad it. */}
      <View style={[styles.header, edit && styles.headerUnderBanner]}>
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

      {(isCartExpanded || isIncomingExpanded) && (
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            setIsCartExpanded(false);
            setIsIncomingExpanded(false);
          }}
          accessibilityLabel="Collapse the sale"
        />
      )}

      {/*
        Hidden while editing: accepting a new order would push it into the cart
        that is currently holding someone else's bill.
      */}
      {!edit && (
        <IncomingOrdersSheet
          orders={incomingOrders}
          unseenCount={unseenCount}
          isExpanded={isIncomingExpanded}
          onToggle={toggleIncoming}
          onSelect={openIncomingOrder}
        />
      )}

      <CartSheet
        lines={lines}
        totals={totals}
        // The order type is fixed for the life of a placed order: switching it
        // mid-edit would swap the service charge and invalidate the basis the
        // delivery fee was quoted under. Passing none renders no chips.
        orderTypes={edit ? [] : orderTypes}
        orderTypeId={orderTypeId}
        isExpanded={isCartExpanded}
        onToggle={toggleCart}
        onSelectOrderType={(type) => setOrderType(type.id, type.name, type.serviceCharge)}
        onChangeQty={setQty}
        onClear={() => {
          reset();
          setIsCartExpanded(false);
        }}
        onCharge={() => router.push("/(main)/pos-tender")}
        discountLines={discountLines}
        // Offered on an edit too. The order's own discount is re-priced by
        // `repriceEditDiscount` and a code added here is a second line on top
        // of it, capped against the bill by `editModeTotals` — so a customer
        // who produces a voucher after ordering no longer needs the order
        // cancelled and re-rung.
        onAddDiscount={() => setIsDiscountOpen(true)}
        onRemoveDiscount={(line) => {
          if (line.code) removeVoucher(line.code);
          else clearManualDiscount();
        }}
        chargeLabel={
          !edit
            ? undefined
            : edit.intent === "collect"
              ? "Save · collect"
              : edit.intent === "refund"
                ? "Save · refund"
                : "Save changes"
        }
        // The difference to settle, not the order's total — the rest is paid.
        chargeTotal={edit ? Math.abs(edit.balance) : undefined}
        blockedReason={
          edit && !edit.canSave
            ? (edit.blockedReason ?? "Change something to save this order.")
            : undefined
        }
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

      <DiscountSheet
        visible={isDiscountOpen}
        onClose={() => setIsDiscountOpen(false)}
        tenantId={tenantId}
        user={{ role, isOwner, permissions }}
        onCheckVoucher={checkVoucher}
        onApplyVoucher={applyVoucher}
        onApplyManual={(manual) => setManualDiscount(manual, { role, isOwner, permissions })}
        // From the session, not the priced lines: a voucher held but currently
        // worth nothing is still applied, and offering it again would look
        // like the register had forgotten it.
        appliedCodes={discount.vouchers.map((held) => held.code)}
        hasManualDiscount={discount.manual !== null}
        onRemoveVoucher={removeVoucher}
        onRemoveManual={clearManualDiscount}
      />
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
  headerUnderBanner: { paddingTop: spacing.sm },
  editBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: TOP_INSET,
    paddingBottom: spacing.md,
    backgroundColor: colors.accentLight,
  },
  editBannerMain: { flex: 1 },
  editBannerTitle: { ...typography.caption, fontWeight: "700", color: colors.accent },
  editBannerTotals: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  editBannerCancel: { ...typography.body, color: colors.accent, fontWeight: "600" },
  editWarnings: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.warningLight,
  },
  editWarningText: { ...typography.small, color: colors.textPrimary },
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

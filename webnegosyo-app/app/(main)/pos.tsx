import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { sanitizeSearchQuery, type Category } from "../../lib/products";
import { type PosOrderType } from "../../lib/pos-catalog";
import {
  pricingForOrderType,
  type OrderTypePriceIndex,
} from "../../lib/order-type-pricing";
import { usePosCatalog, type RegisterItem } from "../../lib/query/use-pos-catalog";
import { useRegisterPricing } from "../../lib/query/use-register-pricing";
import { useRefetchOnScreenFocus } from "../../lib/query/use-screen-focus";
import { PLATFORM_STALE_MS } from "../../lib/query/query-client";
import { displayPriceForOrderType } from "../../lib/pos-order-type-pricing";
import { quantityByItem, type PosCartSelection } from "../../lib/pos-cart";
import { fetchPosStockCeilings } from "../../lib/pos-stock-ceilings";
import {
  resolvePosStockWarning,
  type PosStockCeilings,
} from "../../lib/pos-stock-warning";
import { formatPeso } from "../../lib/format";
import { resolvePosLayout } from "../../lib/pos-layout";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { ModifierSheet } from "../../components/pos/ModifierSheet";
import { CartSheet } from "../../components/pos/CartSheet";
import { DiscountSheet } from "../../components/pos/DiscountSheet";
import { DeliverySheet } from "../../components/pos/DeliverySheet";
import { PosTablePickerSheet } from "../../components/pos/PosTablePickerSheet";
import { useDiningTables } from "../../lib/tables/use-dining-tables";
import { IncomingOrdersSheet } from "../../components/pos/IncomingOrdersSheet";
import { ProductTile } from "../../components/pos/ProductTile";
import { EmptyState } from "../../components/EmptyState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { OfflineBanner } from "../../components/pos/OfflineBanner";
import { SubScreenLinks } from "../../components/SubScreenLinks";
import { Icon } from "../../components/Icon";

/** Height of the notch pad on the full-bleed edit banner, which sits above
 *  <ScreenHeader> and so cannot use its inset. */
const TOP_INSET = 60;

/** Rows rendered before the first scroll — roughly two screens' worth. */
const INITIAL_ROWS = 6;

// TODO: Replace double assertion with a generated Convex function reference once
// codegen is wired into the mobile app (same workaround used across the screens).
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;

/** No stock read yet, or none possible. Read as "no opinion", never as empty shelves. */
const EMPTY_CEILINGS: PosStockCeilings = new Map();

/** No exact per-order-type prices loaded yet — every type prices by markup alone. */
const EMPTY_PRICE_INDEX: OrderTypePriceIndex = {};

/** Stable empties, so a render before the reads land does not churn the memos. */
const NO_ITEMS: RegisterItem[] = [];
const NO_CATEGORIES: Category[] = [];
const NO_ORDER_TYPES: PosOrderType[] = [];

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
  const delivery = usePosCartStore((s) => s.delivery);
  const setDelivery = usePosCartStore((s) => s.setDelivery);
  const setEditDeliveryFee = usePosCartStore((s) => s.setEditDeliveryFee);
  const saleTable = usePosCartStore((s) => s.table);
  const setTable = usePosCartStore((s) => s.setTable);
  // The floor, for the dine-in table picker; empty for a store without one.
  const floor = useDiningTables();
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);
  const [isTableOpen, setIsTableOpen] = useState(false);

  // The register's shape, recomputed on every rotation and split-screen resize
  // (lib/pos-layout.ts). A tablet gets the sale as a column beside the grid; a
  // phone keeps the bottom sheet it has always had.
  const windowSize = useWindowDimensions();
  const layout = useMemo(
    () => resolvePosLayout({ width: windowSize.width, height: windowSize.height }),
    [windowSize.width, windowSize.height],
  );
  // The sale column draws its own notch pad — <ScreenHeader> only covers the
  // grid column beside it.
  const insets = useSafeAreaInsets();

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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
    // `delivery` too: attaching a fee changes the total and what a
    // free-delivery voucher is worth, without touching a line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, serviceCharge, discount, delivery],
  );

  // Priced against the current cart, so a voucher that stops qualifying after
  // a line is voided disappears from the sheet rather than being billed.
  const discountLines = useMemo(
    () => usePosCartStore.getState().sessionDiscount().lines,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, serviceCharge, discount, delivery],
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

  // ── The menu the register sells from ──
  // Read through the shared cache, not a mount-time `useEffect`: this is a TAB,
  // so it mounts once per launch and never again. Its own one-shot read meant a
  // dish added in the editor — or by anyone on the web admin — was unsellable
  // until the cashier force-quit the app.
  const catalog = usePosCatalog(tenantId, registerOutletId);
  const pricing = useRegisterPricing(tenantId);

  const items = catalog.data?.items ?? NO_ITEMS;
  const categories = catalog.data?.categories ?? NO_CATEGORIES;
  const orderTypes = pricing.data?.orderTypes ?? NO_ORDER_TYPES;
  const priceIndex = pricing.data?.priceIndex ?? EMPTY_PRICE_INDEX;
  const isLoading = catalog.isLoading || pricing.isLoading;
  // A failed PRICE read is a load error, not a fallback to list prices: the
  // register must never quietly undercharge on a marked-up channel.
  const loadError = catalog.error ?? pricing.error;

  // What the chosen channel charges. Loaded with the catalog, so a chip and
  // its pricing arrive together — a type shown before its prices would ring
  // up at list. Null under edit: a placed order keeps the prices it was
  // quoted, and its type cannot be switched anyway.
  const pricingFor = useCallback(
    (type: PosOrderType | undefined) =>
      editContext ? null : pricingForOrderType(type, priceIndex),
    [editContext, priceIndex],
  );
  const activePricing = useMemo(
    () => pricingFor(orderTypes.find((type) => type.id === orderTypeId)),
    [pricingFor, orderTypes, orderTypeId],
  );

  // ── What the kitchen can actually make ──
  // A WARNING, never a refusal: the cashier is facing a paying customer and can
  // see the shelf, so the software says its piece and the human decides. The
  // web checkout refuses instead, because nobody is standing over that customer.
  // Refetched whenever the cart changes, since every sale moves the number.
  const [stockCeilings, setStockCeilings] = useState<PosStockCeilings>(EMPTY_CEILINGS);
  useEffect(() => {
    let cancelled = false;
    void fetchPosStockCeilings(tenantId, registerOutletId).then((ceilings) => {
      if (!cancelled) setStockCeilings(ceilings);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, registerOutletId, lines]);

  const stockWarning = useMemo(
    () => resolvePosStockWarning(lines, stockCeilings),
    [lines, stockCeilings],
  );

  // Default to the first order type so the cashier can ring up immediately;
  // they can switch before tendering. Priced from the index that came with the
  // types, so a chip is never shown ahead of what it charges.
  useEffect(() => {
    if (orderTypes.length === 0) return;
    if (usePosCartStore.getState().orderTypeId) return;
    const [first] = orderTypes;
    const startingPricing = usePosCartStore.getState().editContext
      ? null
      : pricingForOrderType(first, priceIndex);
    setOrderType(first.id, first.name, first.serviceCharge, startingPricing);
  }, [orderTypes, priceIndex, setOrderType]);

  // Coming back to the register stands in for the mount it never gets again,
  // and only when the cache is stale — an ordinary tab switch is not a read.
  const { refetch: refetchCatalog } = catalog;
  const { refetch: refetchPricing } = pricing;
  const menuUpdatedAt = Math.min(catalog.dataUpdatedAt, pricing.dataUpdatedAt);
  const isMenuBusy = isLoading || catalog.isRefetching || pricing.isRefetching;
  useRefetchOnScreenFocus({
    enabled: !!tenantId,
    dataUpdatedAt: menuUpdatedAt,
    staleMs: PLATFORM_STALE_MS,
    isFetching: isMenuBusy,
    refetch: async () => { await Promise.all([refetchCatalog(), refetchPricing()]); },
  });

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

  const rows = useMemo(
    () => toRows(visibleItems, layout.columns),
    [visibleItems, layout.columns],
  );

  const addToCart = (item: RegisterItem, selections: PosCartSelection[], quantity: number) => {
    // Both at the store price: the store derives `basePrice` from
    // `listBasePrice` through the sale's channel pricing.
    const listBasePrice = item.product.discounted_price ?? item.product.price;
    try {
      add({
        menuItemId: item.product.id,
        name: item.product.name,
        listBasePrice,
        basePrice: listBasePrice,
        quantity,
        selections,
      });
      setSheetFor(null);
    } catch (error) {
      Alert.alert("Check branch", error instanceof Error ? error.message : "Unable to add this item.");
    }
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

  // ── The two halves of the register, composed once and then arranged ──
  // Both layouts render exactly these pieces; only where they sit changes.

  const productColumn = (
    <>
      {/* Silent while online with nothing queued; see components/pos/OfflineBanner. */}
      <OfflineBanner />
      <ScreenHeader
        title="POS"
        subtitle={`${visibleItems.length} ${visibleItems.length === 1 ? "product" : "products"}`}
        ignoreTopInset={!!edit}
        style={styles.header}
        actions={<SubScreenLinks parent="pos" variant="actions" />}
      >
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.textTertiary} />
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
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Icon name="close" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </ScreenHeader>

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
                price={displayPriceForOrderType(item.product, activePricing)}
                imageUrl={item.product.image_url}
                quantity={inSale[item.product.id] ?? 0}
                hasOptions={item.groups.length > 0}
                onPress={() => handleTap(item)}
              />
            ))}
            {/* Keep the final row's columns aligned with the rows above it. */}
            {Array.from({ length: layout.columns - row.length }).map((_, index) => (
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
    </>
  );

  // Dims whatever the open drawer is covering. Mounted INSIDE the column that
  // owns that drawer, so on a tablet it dims the grid and leaves the sale
  // panel beside it readable.
  const backdrop = (isCartExpanded || isIncomingExpanded) && (
    <Pressable
      style={styles.backdrop}
      onPress={() => {
        setIsCartExpanded(false);
        setIsIncomingExpanded(false);
      }}
      accessibilityLabel="Collapse the sale"
    />
  );

  /*
    Hidden while editing: accepting a new order would push it into the cart
    that is currently holding someone else's bill.
  */
  const incomingSheet = !edit && (
    <IncomingOrdersSheet
      orders={incomingOrders}
      unseenCount={unseenCount}
      isExpanded={isIncomingExpanded}
      onToggle={toggleIncoming}
      onSelect={openIncomingOrder}
    />
  );

  /*
    Sits above the cart, where the cashier is already looking before they
    charge. Deliberately not a modal and not a blocker — it informs the
    person who can see the shelf, and they ring the sale anyway if they
    have the stock.
  */
  const stockBanner = stockWarning ? (
    <View style={styles.stockWarning}>
      <Text style={styles.stockWarningText}>{stockWarning}</Text>
    </View>
  ) : null;

  const sale = (
    <CartSheet
      // Bottom sheet on a phone, permanent column on a tablet. Same
      // props and the same money either way — only the arrangement
      // differs (components/pos/CartSheet.tsx).
      variant={layout.isTwoPane ? "panel" : "sheet"}
      lines={lines}
      // In edit mode the fees live on the edit context, not the counter sale
      // — shown here so the rows the cashier reads reflect what the revision
      // will actually charge. The service charge is the figure the order was
      // PLACED with; the register cannot recompute it (the order type's rate
      // may have moved since) and must not try.
      totals={
        editContext
          ? {
              ...totals,
              deliveryFee: editContext.deliveryFee,
              serviceCharge: editContext.serviceCharge,
            }
          : totals
      }
      // Whatever the placed bill held beyond items, service and delivery.
      // Named `Adjustment` rather than left invisible — see CartSheet.
      adjustment={editContext ? editContext.carriedCharges : 0}
      // The order type is fixed for the life of a placed order: switching it
      // mid-edit would swap the service charge and invalidate the basis the
      // delivery fee was quoted under. Passing none renders no chips.
      orderTypes={edit ? [] : orderTypes}
      orderTypeId={orderTypeId}
      isExpanded={isCartExpanded}
      onToggle={toggleCart}
      onSelectOrderType={(type) =>
        setOrderType(type.id, type.name, type.serviceCharge, pricingFor(type), type.type)
      }
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
      onEditDelivery={() => setIsDeliveryOpen(true)}
      onEditTable={edit ? undefined : () => setIsTableOpen(true)}
      tableLabel={saleTable.label}
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
  );

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

      {/*
        Tablet: products on the left, the sale stacked down its own column on
        the right. Phone: one column, with the sale docked to the bottom as a
        collapsible sheet. `resolvePosLayout` picks between them from the live
        window size, so rotating a tablet re-arranges the register.
      */}
      {layout.isTwoPane ? (
        <View style={styles.panes}>
          <View style={styles.gridColumn}>
            {productColumn}
            {backdrop}
            {incomingSheet}
          </View>
          <View style={[styles.saleColumn, { width: layout.panelWidth, paddingTop: edit ? 0 : insets.top }]}>
            {stockBanner}
            {sale}
          </View>
        </View>
      ) : (
        <>
          {productColumn}
          {backdrop}
          {incomingSheet}
          {stockBanner}
          {sale}
        </>
      )}

      {sheetFor && (
        <ModifierSheet
          visible
          itemName={sheetFor.product.name}
          basePrice={displayPriceForOrderType(sheetFor.product, activePricing)}
          groups={sheetFor.groups}
          pricing={activePricing}
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

      <PosTablePickerSheet
        visible={isTableOpen}
        onClose={() => setIsTableOpen(false)}
        table={saleTable}
        tables={floor.tables}
        seatings={floor.seatings}
        onSave={(table) => {
          setTable(table);
          setIsTableOpen(false);
        }}
      />
      <DeliverySheet
        visible={isDeliveryOpen}
        onClose={() => setIsDeliveryOpen(false)}
        // Editing a placed order revises the fee it carries; address and phone
        // belong to the order and are not editable at the till, so the sheet
        // shows the fee alone there.
        feeOnly={editContext !== null}
        delivery={
          editContext
            ? {
                fee: editContext.deliveryFee > 0 ? editContext.deliveryFee : null,
                address: "",
                phone: "",
              }
            : delivery
        }
        onSave={(details) => {
          if (editContext) setEditDeliveryFee(details.fee ?? 0);
          else setDelivery(details);
        }}
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
  header: { paddingBottom: spacing.sm },
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
  // Amber, not red: this is something to know, not something that went wrong.
  stockWarning: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  stockWarningText: { ...typography.caption, color: colors.warning, fontWeight: "600" },
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
  search: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
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
  // Two columns on a tablet: the grid takes whatever the sale column leaves.
  panes: { flex: 1, flexDirection: "row" },
  gridColumn: { flex: 1 },
  saleColumn: { backgroundColor: colors.card },
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

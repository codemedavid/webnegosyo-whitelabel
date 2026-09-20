import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { goTo } from "../../lib/tab-navigation";
import { useRegisterPricing } from "../../lib/query/use-register-pricing";
import { pricingForOrderType } from "../../lib/order-type-pricing";
import { isDineInType } from "../../lib/pos-table";
import { usePosCartStore } from "../../stores/pos-cart-store";
import { FunctionReference } from "convex/server";

import { colors, spacing, typography } from "../../theme/colors";
import { useKeepAwakeWhileFocused } from "../../hooks/useKeepAwakeWhileFocused";
import { useSafeQuery } from "../../lib/hooks";
import { filterOrdersToScope } from "../../lib/branch-scope";
import { useBranchScope } from "../../lib/use-branch-scope";
import { useOutlets } from "../../lib/use-outlets";
import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import type { OrderDto } from "../../lib/backends/supabase-orders";
import {
  buildTableViews,
  filterViews,
  nextRotation,
  summarizeFloor,
  type DiningTable,
  type TableView,
} from "../../lib/tables/table-floor";
import {
  mergeMoves,
  suggestNewPosition,
  tidyPositions,
  type PositionMove,
  type TablePlacement,
} from "../../lib/tables/floor-layout";
import { canClearTable } from "../../lib/tables/table-actions";
import { floorSubtitle } from "../../lib/tables/table-copy";
import type { TableDraftValue } from "../../lib/tables/table-form";
import { useDiningTables, useTableWrites } from "../../lib/tables/use-dining-tables";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { OptionPills } from "../../components/OptionPills";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { TickerProvider, useTickerNow } from "../../components/TickerProvider";
import { ScreenHeader } from "../../components/ScreenHeader";
import { FloorCanvas } from "../../components/tables/FloorCanvas";
import { FloorSummaryStrip, type FloorFilter } from "../../components/tables/FloorSummaryStrip";
import { SeatPartySheet } from "../../components/tables/SeatPartySheet";
import { TableFormSheet } from "../../components/tables/TableFormSheet";
import { TableQuickSheet, type QuickSheetOrder } from "../../components/tables/TableQuickSheet";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

/** Same bounded recent-orders page the queue and the kitchen read. */
const ORDERS_FETCH_LIMIT = 200;
/** Timers redraw twice a minute; a seated clock does not need seconds. */
const TIMER_TICK_MS = 30_000;
const KEEP_AWAKE_TAG = "tables-floor";
/** The floor draws two-pane from this width: canvas left, seated list right. */
const TWO_PANE_MIN_WIDTH = 900;
const CANVAS_MAX_WIDTH = 640;

/** The single-location floor, or a multi-branch store's unbranched tables. */
const MAIN_FLOOR = "__main__";

export default function TablesScreen() {
  return (
    <TickerProvider intervalMs={TIMER_TICK_MS}>
      <Floor />
    </TickerProvider>
  );
}

function Floor() {
  // A host stand that dims mid-service is no host stand — held only in view.
  useKeepAwakeWhileFocused(KEEP_AWAKE_TAG);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTwoPane = width >= TWO_PANE_MIN_WIDTH;
  const nowMs = useTickerNow();

  const { tables, seatings, isLoading, error, refetch } = useDiningTables();
  const writes = useTableWrites();
  const { data: orders, refetch: refetchOrders } = useSafeQuery<OrderDto[]>(getOrdersRef, {
    limit: ORDERS_FETCH_LIMIT,
  });
  const scope = useBranchScope();
  const { outlets } = useOutlets();
  const tenantId = useAuthStore((s) => s.tenantId);
  const pricing = useRegisterPricing(tenantId);
  const dineInType = useMemo(
    () => pricing.data?.orderTypes.find((type) => isDineInType(type)) ?? null,
    [pricing.data],
  );

  // ---- per-visit state: a tab mounts once per launch, so this resets on focus
  const [filter, setFilter] = useState<FloorFilter>("all");
  const [floorId, setFloorId] = useState<string>(MAIN_FLOOR);
  const [isEditing, setEditing] = useState(false);
  const [pendingMoves, setPendingMoves] = useState<PositionMove[]>([]);
  const [selected, setSelected] = useState<TableView | null>(null);
  const [sheet, setSheet] = useState<"quick" | "seat" | "form" | null>(null);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [isRefreshing, setRefreshing] = useState(false);

  // ---- which floor
  const floorOptions = useMemo(() => {
    if (scope.kind === "branch" || outlets.length <= 1) return [];
    const hasMain = tables.some((table) => table.outletId === null);
    return [
      ...(hasMain ? [{ label: "Main", value: MAIN_FLOOR }] : []),
      ...outlets.map((outlet) => ({ label: outlet.name, value: outlet.id })),
    ];
  }, [scope, outlets, tables]);

  const activeOutletId: string | null =
    scope.kind === "branch" ? scope.outletId : floorId === MAIN_FLOOR ? null : floorId;

  // A branch chosen on another screen, or a floor that no longer exists,
  // must not leave the pills pointing at nothing.
  useEffect(() => {
    if (floorOptions.length === 0) return;
    if (!floorOptions.some((option) => option.value === floorId)) setFloorId(floorOptions[0].value);
  }, [floorOptions, floorId]);

  const floorTables = useMemo(
    () => tables.filter((table) => table.outletId === activeOutletId),
    [tables, activeOutletId],
  );

  // ---- the floor, derived
  const scopedOrders = useMemo(() => filterOrdersToScope(scope, orders) as OrderDto[] | undefined, [scope, orders]);
  const views = useMemo(
    () => buildTableViews<QuickSheetOrder>(floorTables, seatings, scopedOrders ?? [], nowMs),
    [floorTables, seatings, scopedOrders, nowMs],
  );
  const summary = useMemo(() => summarizeFloor(views), [views]);
  const highlighted = useMemo(() => new Set(filterViews(views, filter).map((view) => view.table.id)), [views, filter]);
  const seatedList = useMemo(
    () => views.filter((view) => view.seating).sort((a, b) => (b.seatedForMs ?? 0) - (a.seatedForMs ?? 0)),
    [views],
  );

  // The sheet shows the live view of the table it opened for, not a snapshot.
  const selectedView = useMemo(
    () => (selected ? views.find((view) => view.table.id === selected.table.id) ?? null : null),
    [views, selected],
  );

  // Where a table stands on screen right now: the saved placement, unless an
  // unsaved drag or turn has moved it since.
  const placementOf = useCallback(
    (view: TableView): TablePlacement => {
      const move = pendingMoves.find((entry) => entry.id === view.table.id);
      if (!move) return { x: view.table.posX, y: view.table.posY, rotation: view.table.rotation };
      return { x: move.posX, y: move.posY, rotation: move.rotation ?? view.table.rotation };
    },
    [pendingMoves],
  );

  // ---- layout edits are flushed when Done is tapped, and when the tab is left
  //
  // Both the pending moves and the writer are read through refs so that
  // `flushMoves` — and with it the focus effect below — keeps ONE identity for
  // the life of the screen. Depending on `writes` here made the focus effect
  // re-run on every render, which closed whichever sheet had just been opened.
  const pendingRef = useRef(pendingMoves);
  pendingRef.current = pendingMoves;
  const writesRef = useRef(writes);
  writesRef.current = writes;
  const flushMoves = useCallback(async () => {
    const moves = pendingRef.current;
    if (moves.length === 0) return;
    setPendingMoves([]);
    try {
      await writesRef.current.savePositions(moves);
    } catch (e: unknown) {
      Alert.alert("Layout not saved", e instanceof Error ? e.message : "Try again.");
    }
  }, []);

  // Per-visit state only: a tab mounts once per launch, so the filter and any
  // open sheet are cleared on arrival rather than on mount. The dependency
  // array MUST stay empty — anything in it that changes per render turns this
  // into a per-render reset.
  useFocusEffect(
    useCallback(() => {
      setFilter("all");
      setSheet(null);
      setSelected(null);
      return () => {
        setEditing(false);
        void flushMoves();
      };
    }, [flushMoves]),
  );

  const guardDemo = (): boolean => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return true;
    }
    return false;
  };

  const report = (title: string, e: unknown) =>
    Alert.alert(title, e instanceof Error ? e.message : "Something went wrong. Try again.");

  // ---- handlers
  const handlePressTable = (view: TableView) => {
    setSelected(view);
    if (isEditing) {
      setEditingTable(view.table);
      setSheet("form");
    } else {
      setSheet("quick");
    }
  };

  const handleMove = (move: PositionMove) => setPendingMoves((pending) => mergeMoves(pending, move));

  // A turn is a move like any other: shown at once, written when Done is
  // tapped, so a merchant can spin a table round without a write each time.
  const handleRotate = (view: TableView) => {
    const placement = placementOf(view);
    setPendingMoves((pending) =>
      mergeMoves(pending, {
        id: view.table.id,
        posX: placement.x,
        posY: placement.y,
        rotation: nextRotation(placement.rotation),
      }),
    );
  };

  const handleTidy = () => {
    const moves = tidyPositions(
      views.map((view) => {
        const placement = placementOf(view);
        return { id: view.table.id, posX: placement.x, posY: placement.y };
      }),
    );
    if (moves.length === 0) {
      Alert.alert("Already tidy", "Every table is on its slot. Drag one to shape the room.");
      return;
    }
    setPendingMoves((pending) => moves.reduce(mergeMoves, pending));
  };

  const toggleEditing = () => {
    if (isEditing) {
      setEditing(false);
      void flushMoves();
      return;
    }
    if (guardDemo()) return;
    setEditing(true);
  };

  const handleAddTable = () => {
    if (guardDemo()) return;
    setEditingTable(null);
    setSheet("form");
  };

  const handleSaveTable = async (value: TableDraftValue) => {
    try {
      if (editingTable) {
        await writes.update(editingTable.id, value);
      } else {
        const position = suggestNewPosition(floorTables.map((table) => ({ x: table.posX, y: table.posY })));
        await writes.create({
          outletId: activeOutletId,
          value,
          posX: position.x,
          posY: position.y,
          sortOrder: floorTables.length,
        });
      }
      setSheet(null);
    } catch (e: unknown) {
      report("Table not saved", e);
    }
  };

  const handleArchiveTable = (table: DiningTable) => {
    Alert.alert("Remove this table?", `Table ${table.label} leaves the floor. Its history stays.`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await writes.archive(table.id);
            setSheet(null);
          } catch (e: unknown) {
            report("Table not removed", e);
          }
        },
      },
    ]);
  };

  const handleSeat = async (partySize: number, note: string) => {
    if (!selectedView || guardDemo()) return;
    try {
      await writes.seat(selectedView.table.id, partySize, note);
      setSheet("quick");
    } catch (e: unknown) {
      report("Party not seated", e);
    }
  };

  const handlePartySize = async (view: TableView, partySize: number) => {
    if (!view.seating || guardDemo()) return;
    try {
      await writes.setPartySize(view.seating.id, partySize);
    } catch (e: unknown) {
      report("Party size not changed", e);
    }
  };

  const handleClear = (view: TableView) => {
    if (guardDemo()) return;
    const verdict = canClearTable(view);
    if (!verdict.allowed) {
      Alert.alert("Not yet", verdict.reason);
      return;
    }
    const clear = async () => {
      if (!view.seating) {
        setSheet(null);
        return;
      }
      try {
        await writes.clear(view.seating.id);
        setSheet(null);
      } catch (e: unknown) {
        report("Table not cleared", e);
      }
    };
    if (verdict.confirm) {
      Alert.alert("Clear the table?", verdict.confirm, [
        { text: "Keep", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: () => void clear() },
      ]);
      return;
    }
    void clear();
  };

  const handleRefresh = () => refreshWithMinSpinner([refetch, refetchOrders], setRefreshing);

  // ---- to the register
  // The sale is set up here and the register opens on it: dine-in type (with
  // its channel pricing), the table, the party. A sale already on the counter
  // is never silently merged — the same guard the order editor applies.
  const startOrderFor = (view: TableView) => {
    if (!dineInType || guardDemo()) return;
    const register = usePosCartStore.getState();
    const begin = () => {
      register.reset();
      register.setOrderType(
        dineInType.id,
        dineInType.name,
        dineInType.serviceCharge,
        pricingForOrderType(dineInType, pricing.data?.priceIndex ?? {}),
        dineInType.type,
      );
      register.setTable({
        label: view.table.label,
        tableId: view.table.id,
        partySize: view.seating?.partySize ?? null,
      });
      setSheet(null);
      goTo(router, "/(main)/pos");
    };
    if (register.lines.length > 0 || register.editContext) {
      Alert.alert("Clear the register?", "A sale is already on the counter. Start this table's order instead?", [
        { text: "Keep the sale", style: "cancel" },
        { text: "Start this order", style: "destructive", onPress: begin },
      ]);
      return;
    }
    begin();
  };

  const handleAddItems = (_view: TableView, orderId: string) => {
    // The order page owns the append flow (its gate, its catalog load); the
    // floor only takes the host to it.
    setSheet(null);
    router.push(`/(main)/order/${orderId}`);
  };

  const openOrder = (orderId: string) => {
    setSheet(null);
    router.push(`/(main)/order/${orderId}`);
  };

  const openTable = (view: TableView) => {
    setSheet(null);
    router.push(`/(main)/table/${view.table.id}`);
  };

  // ---- render
  const outletName = scope.kind === "branch" ? outlets.find((outlet) => outlet.id === scope.outletId)?.name : null;
  const subtitle = outletName ? `${floorSubtitle(summary)} · ${outletName}` : floorSubtitle(summary);

  let body: React.ReactNode;
  if (isLoading) {
    body = <LoadingState message="Drawing the floor" />;
  } else if (error) {
    body = <ErrorState title="The floor did not load" message={error} onRetry={() => void refetch()} />;
  } else if (floorTables.length === 0) {
    body = (
      <EmptyState
        icon="tables"
        title="Draw your floor"
        message="Add the tables your guests sit at, then seat parties and watch their orders come through."
        actionLabel="Add a table"
        onAction={handleAddTable}
      />
    );
  } else {
    const canvas = (
      <FloorCanvas
        views={views}
        placementOf={placementOf}
        isEditing={isEditing}
        isHighlighted={(view) => highlighted.has(view.table.id)}
        onPressTable={handlePressTable}
        onMoveTable={handleMove}
        onRotateTable={handleRotate}
        maxWidth={CANVAS_MAX_WIDTH}
      />
    );
    body = (
      <>
        {isEditing ? (
          <View style={styles.editBar}>
            <Text style={styles.editHint}>
              Drag tables into place, tap the arrow to turn one, tap the table itself to change it. Done saves the room.
            </Text>
            <Button label="Tidy up" tone="ghost" size="sm" onPress={handleTidy} />
          </View>
        ) : (
          <FloorSummaryStrip summary={summary} filter={filter} onFilter={setFilter} />
        )}
        {isTwoPane ? (
          <View style={styles.twoPane}>
            <View style={styles.paneCanvas}>{canvas}</View>
            <View style={styles.paneList}>
              <Text style={styles.paneTitle}>Seated now</Text>
              {seatedList.length === 0 ? (
                <Text style={styles.paneQuiet}>No parties seated.</Text>
              ) : (
                seatedList.map((view) => (
                  <SeatedRow key={view.table.id} view={view} onPress={() => handlePressTable(view)} />
                ))
              )}
            </View>
          </View>
        ) : (
          canvas
        )}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Tables"
        subtitle={subtitle}
        actions={
          <>
            <IconButton icon="plus" label="Add a table" onPress={handleAddTable} />
            <IconButton
              icon={isEditing ? "check" : "edit"}
              label={isEditing ? "Done editing the layout" : "Edit the layout"}
              tone={isEditing ? "primary" : "ghost"}
              onPress={toggleEditing}
            />
          </>
        }
      >
        {floorOptions.length > 0 ? (
          <OptionPills<string>
            options={floorOptions}
            isSelected={(value) => value === floorId}
            onSelect={setFloorId}
            accessibilityPrefix="Floor"
          />
        ) : null}
      </ScreenHeader>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.textSecondary} />}
        scrollEnabled={!isEditing}
      >
        {body}
      </ScrollView>

      <TableQuickSheet
        view={selectedView as TableView<QuickSheetOrder> | null}
        visible={sheet === "quick" && selectedView !== null}
        onClose={() => setSheet(null)}
        onSeat={() => setSheet("seat")}
        onPartySize={handlePartySize}
        onClear={handleClear}
        onOpenOrder={openOrder}
        onOpenTable={openTable}
        onNewOrder={dineInType ? startOrderFor : undefined}
        onAddItems={handleAddItems}
      />
      <SeatPartySheet
        view={selectedView}
        visible={sheet === "seat" && selectedView !== null}
        onClose={() => setSheet("quick")}
        onSeat={handleSeat}
        isSaving={writes.isSaving}
      />
      <TableFormSheet
        visible={sheet === "form"}
        table={editingTable}
        floorTables={floorTables}
        onClose={() => setSheet(null)}
        onSave={handleSaveTable}
        onArchive={handleArchiveTable}
        isSaving={writes.isSaving}
      />
    </View>
  );
}

function SeatedRow({ view, onPress }: { view: TableView; onPress: () => void }) {
  return (
    <View style={styles.seatedRow} accessibilityRole="button" onTouchEnd={onPress}>
      <Text style={styles.seatedLabel}>{view.table.label}</Text>
      <View style={styles.seatedCopy}>
        <Text style={styles.seatedTitle}>{`${view.covers} guests`}</Text>
        <Text style={styles.seatedMeta}>{`${view.status} · ${view.orders.length} orders`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 96, gap: spacing.lg },
  editBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
  },
  editHint: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", flex: 1 },
  twoPane: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  paneCanvas: { flex: 3 },
  paneList: { flex: 2, gap: spacing.sm },
  paneTitle: { ...typography.heading, color: colors.textPrimary },
  paneQuiet: { ...typography.caption, color: colors.textSecondary },
  seatedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
  },
  seatedLabel: { ...typography.title, color: colors.textPrimary, minWidth: 44, textAlign: "center" },
  seatedCopy: { flex: 1 },
  seatedTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  seatedMeta: { ...typography.caption, color: colors.textSecondary, textTransform: "capitalize" },
});

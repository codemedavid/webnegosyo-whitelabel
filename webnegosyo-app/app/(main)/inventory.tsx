import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuthStore } from "../../stores/auth-store";
import { useBranchScope, useAccountBranchScope } from "../../lib/use-branch-scope";
import { loadInventoryStock } from "../../lib/inventory-service";
import {
  filterStockViews,
  summarizeStock,
  type StockItemView,
} from "../../lib/inventory-stock";
import { categoryChips, filterByCategory, stockValue } from "../../lib/inventory-insights";
import {
  loadIngredientIndex,
  setIngredientActive,
  type IngredientIndexRow,
} from "../../lib/ingredient-service";
import type { ManualMovementReason } from "../../lib/inventory-movement";
import { ingredientEditorHref, ingredientHref, NEW_INGREDIENT_ID } from "../../lib/navigation";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { IconButton } from "../../components/IconButton";
import { Icon } from "../../components/Icon";
import { InventoryHero, type LevelFilter } from "../../components/inventory/InventoryHero";
import {
  InventoryActionBar,
  type InventoryAction,
} from "../../components/inventory/InventoryActionBar";
import { CategoryChips } from "../../components/inventory/CategoryChips";
import { IngredientPickerSheet } from "../../components/inventory/IngredientPickerSheet";
import { ArchivedIngredientsSheet } from "../../components/inventory/ArchivedIngredientsSheet";
import { InventoryStockCard } from "../../components/InventoryStockCard";
import { StockMovementSheet } from "../../components/StockMovementSheet";
import { StockCountPanel } from "../../components/StockCountPanel";
import { TransferBenchPanel } from "../../components/TransferBenchPanel";
import { TransferComposeSheet } from "../../components/TransferComposeSheet";
import { useOutlets } from "../../lib/use-outlets";
import {
  loadTransfers,
  loadTransferLines,
  submitTransferStep,
  type TransferLineView,
} from "../../lib/inventory-transfer-service";
import type { TransferSummary } from "../../lib/inventory-transfers";
import {
  loadOpenCount,
  openCount,
  closeCount,
  type OpenCountSession,
} from "../../lib/count-session-service";

/**
 * The merchant app's ingredient shelf.
 *
 * The web admin shows stock as a banner of alerts above the inventory table.
 * On the phone the merchant is standing in front of the shelf, so this shows
 * the whole thing, sorted worst-first, with the trouble counted at the top.
 *
 * Every judgement about stock comes from lib/inventory-stock.ts — the same pure
 * rules the web core and the server-side alert writer use. This screen only
 * arranges them.
 */
export default function InventoryScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const scope = useBranchScope();
  // Composing asks what the ACCOUNT may do, never what it is currently
  // looking at: drilling into a branch is a narrowing of the view, not a
  // demotion of the owner.
  const accountScope = useAccountBranchScope();
  // Undefined, not null, when the merchant is looking at the whole store: null
  // is the unbranched pool, a real shelf, and would show an owner only the
  // stock that predates their branches.
  const outletId = scope.kind === "branch" ? scope.outletId : undefined;

  const [shelf, setShelf] = useState<StockItemView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [recording, setRecording] = useState<StockItemView | null>(null);
  const [count, setCount] = useState<OpenCountSession | null>(null);
  const [countBusy, setCountBusy] = useState(false);
  const [transfers, setTransfers] = useState<TransferSummary[]>([]);
  const [transferLines, setTransferLines] = useState<Record<string, TransferLineView[]>>({});
  const [isComposing, setIsComposing] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [recordingReason, setRecordingReason] = useState<ManualMovementReason>("receive");
  const [picking, setPicking] = useState<ManualMovementReason | null>(null);
  const [index, setIndex] = useState<IngredientIndexRow[]>([]);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const pendingPickRef = useRef<StockItemView | null>(null);

  // Names for the two ends of a transfer. Deliberately NOT filtered to the
  // branch being viewed: a manager receiving from another shop has to be told
  // which shop it came from, and that is a branch they cannot otherwise reach.
  const { outlets } = useOutlets();
  const branchNames = useMemo(
    () => Object.fromEntries(outlets.map((outlet) => [outlet.id, outlet.name])),
    [outlets],
  );

  const userId = useAuthStore((s) => s.userId);

  /**
   * The count running on the shelf currently on screen.
   *
   * Scoped to the same branch the shelf is, never the store pool by default: a
   * count opened against the pool while a manager counts their own branch would
   * measure their work against every branch's ingredients and report them as
   * having barely started.
   */
  const loadCount = useCallback(async () => {
    if (!tenantId) return;
    setCount(await loadOpenCount(tenantId, outletId ?? null));
  }, [tenantId, outletId]);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  const startCount = async () => {
    if (!tenantId) return;
    setCountBusy(true);
    try {
      setCount(await openCount(tenantId, { outletId: outletId ?? null, startedBy: userId }));
    } catch (error) {
      // Surfaced, never swallowed: a merchant who believes a count is running
      // would enter a whole shelf into a session that does not exist.
      Alert.alert(
        "Could not start the count",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setCountBusy(false);
    }
  };

  const finishCount = async () => {
    if (!tenantId || !count) return;
    setCountBusy(true);
    try {
      await closeCount(tenantId, count.id, userId);
      setCount(null);
    } catch (error) {
      Alert.alert(
        "Could not finish the count",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setCountBusy(false);
    }
  };

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);
      setShelf(await loadInventoryStock(tenantId, outletId));
    } catch {
      // An empty list and a failed read look identical, and one of them is a
      // lie — say which one this is.
      setError("Could not load your inventory. Pull down to try again.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
    // Drilling into another branch from the portfolio has to refetch: the
    // roll-up is a single scalar, so there is nothing on the phone to re-filter.
  }, [tenantId, outletId]);

  /** Archived rows only feed the archive link, so a failed read costs just that. */
  const loadIndex = useCallback(async () => {
    if (!tenantId) return;
    try {
      setIndex(await loadIngredientIndex(tenantId));
    } catch {
      setIndex([]);
    }
  }, [tenantId]);

  // On focus rather than mount: tab screens stay mounted, and coming back from
  // the editor or an ingredient's page must show what was just changed there.
  useFocusEffect(
    useCallback(() => {
      load();
      loadIndex();
    }, [load, loadIndex]),
  );

  /**
   * What is on the move, store-wide rather than for the branch being viewed.
   *
   * A transfer has two ends and RLS already decides which the account may see —
   * scoping this to the viewed branch would hide an incoming consignment from
   * the very manager who has to count it in.
   */
  const loadMoving = useCallback(async () => {
    if (!tenantId) return;
    const [summaries, lines] = await Promise.all([
      loadTransfers(tenantId),
      loadTransferLines(tenantId),
    ]);
    setTransfers(summaries);
    setTransferLines(lines);
  }, [tenantId]);

  useEffect(() => {
    loadMoving();
  }, [loadMoving]);

  /**
   * Count a delivery in, then reload both.
   *
   * The shelf has to be refetched, not patched: a receipt credits the
   * destination and can post a shortfall against the sender, either of which
   * can cross a reorder line and 86 a dish. Leaving the old figures on screen
   * would show the merchant stock they no longer have.
   *
   * Deliberately does not catch — the panel is what tells the merchant, and
   * swallowing here would leave it showing a success it never had.
   */
  const onTransferred = useCallback(
    async (transferId: string, counts: Record<string, number>) => {
      if (!tenantId) return;
      await submitTransferStep(tenantId, { action: "receive", transferId, counts });
      await Promise.all([load(), loadMoving()]);
    },
    [tenantId, load, loadMoving],
  );

  /**
   * Draft a transfer and put it on the van, in one tap.
   *
   * Two calls, because the platform route takes them separately. If `send`
   * fails the draft survives and shows up in the bench panel with its own Send
   * and Cancel — nothing is stranded, and the merchant is told what went wrong
   * by the sheet, which is why this does not catch.
   */
  const onComposed = useCallback(
    async (draft: {
      fromOutletId: string | null;
      toOutletId: string | null;
      lines: { inventoryItemId: string; quantity: number }[];
      note?: string;
    }) => {
      if (!tenantId) return;
      const { id } = await submitTransferStep(tenantId, { action: "create", ...draft });
      if (!id) throw new Error("The transfer was not created. Try again.");

      try {
        await submitTransferStep(tenantId, { action: "send", transferId: id });
      } finally {
        // Even a failed send has changed what the list shows — the draft is
        // real and has to appear, or the merchant composes it again.
        await Promise.all([load(), loadMoving()]);
      }
    },
    [tenantId, load, loadMoving],
  );

  /** Finish or abandon a draft that a failed send left behind. */
  const onDispatched = useCallback(
    async (transferId: string) => {
      if (!tenantId) return;
      await submitTransferStep(tenantId, { action: "send", transferId });
      await Promise.all([load(), loadMoving()]);
    },
    [tenantId, load, loadMoving],
  );

  const onAbandoned = useCallback(
    async (transferId: string) => {
      if (!tenantId) return;
      await submitTransferStep(tenantId, { action: "cancel", transferId });
      // Nothing moved, so only the list changes.
      await loadMoving();
    },
    [tenantId, loadMoving],
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
    loadIndex();
    loadCount();
    loadMoving();
  };

  const summary = useMemo(() => summarizeStock(shelf), [shelf]);
  const value = useMemo(() => stockValue(shelf), [shelf]);
  const chips = useMemo(() => categoryChips(shelf), [shelf]);
  const archived = useMemo(() => index.filter((row) => !row.is_active), [index]);
  const visible = useMemo(
    () => filterStockViews(filterByCategory(shelf, category), { level: levelFilter, query: search }),
    [shelf, category, levelFilter, search],
  );
  const isFiltered = levelFilter !== "all" || category !== null || search.trim() !== "";

  // Tapping the active segment again clears it — the only way back to "all"
  // without a fourth chip competing for the same row.
  const toggleLevel = (key: LevelFilter) =>
    setLevelFilter((current) => (current === key ? "all" : key));

  const clearFilters = () => {
    setLevelFilter("all");
    setCategory(null);
    setSearch("");
  };

  const openEditor = () => router.push(ingredientEditorHref(NEW_INGREDIENT_ID));
  const openIngredient = (item: StockItemView) => router.push(ingredientHref(item.id));

  const onAction = (action: InventoryAction) => {
    // A new shortcut is a new intent: a pick still waiting on the last picker's
    // dismissal must not open the sheet for the wrong ingredient.
    pendingPickRef.current = null;
    if (action === "transfer") {
      setIsComposing(true);
      return;
    }
    setPicking(action);
  };

  const onPicked = (item: StockItemView, reason: ManualMovementReason) => {
    setPicking(null);
    setRecordingReason(reason);
    // iOS will not present a second modal while the first is still sliding
    // away — it drops it silently and the shortcut looks broken. Wait for the
    // picker's dismissal there; Android has no such race.
    if (Platform.OS === "ios") {
      pendingPickRef.current = item;
      return;
    }
    setRecording(item);
  };

  const onPickerDismissed = () => {
    const item = pendingPickRef.current;
    pendingPickRef.current = null;
    if (item) setRecording(item);
  };

  const onRestore = async (id: string) => {
    if (!tenantId) return;
    await setIngredientActive(tenantId, id, true);
    await Promise.all([load(), loadIndex()]);
  };

  const body = () => {
    if (isLoading) return <LoadingState message="Loading your shelf..." />;
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (shelf.length === 0) {
      return (
        <EmptyState
          icon="stock"
          title="Start tracking your stock"
          message="Add the ingredients you buy — flour, milk, cups — and see what is running low before service."
          actionLabel="Add your first ingredient"
          onAction={openEditor}
        />
      );
    }
    if (visible.length === 0) {
      return (
        <EmptyState
          icon="search"
          title="Nothing matches"
          message="No ingredient fits these filters."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      );
    }
    return (
      <View style={styles.list}>
        {visible.map((item) => (
          <InventoryStockCard key={item.id} item={item} onPress={openIngredient} />
        ))}
      </View>
    );
  };

  const hasShelf = !isLoading && !error && shelf.length > 0;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Stock"
        subtitle={scope.kind === "branch" ? "This branch's shelf" : "Ingredients, counts and deliveries"}
        actions={<IconButton icon="plus" label="Add ingredient" tone="primary" onPress={openEditor} />}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {hasShelf && (
          <>
            <InventoryHero
              summary={summary}
              value={value}
              levelFilter={levelFilter}
              onToggleLevel={toggleLevel}
            />

            <InventoryActionBar canTransfer={outlets.length > 1} onAction={onAction} />

            <StockCountPanel
              progress={count?.progress ?? null}
              isBusy={countBusy}
              onStart={startCount}
              onFinish={finishCount}
            />
          </>
        )}

        {/*
          Above the shelf, because a box waiting to be counted is a job with
          somebody standing over it, while the shelf below is a reference. It
          renders nothing at all when no stock has ever moved between shops,
          which is most stores.
        */}
        <TransferBenchPanel
          transfers={transfers}
          branchNames={branchNames}
          linesFor={(transferId) => transferLines[transferId] ?? []}
          onReceive={onTransferred}
          onSend={onDispatched}
          onCancel={onAbandoned}
        />

        {hasShelf && (
          <View style={styles.filters}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              <Text style={styles.sectionCount}>
                {isFiltered ? `${visible.length} of ${shelf.length}` : shelf.length}
              </Text>
              {isFiltered && (
                <TouchableOpacity onPress={clearFilters} accessibilityRole="button" style={styles.clear}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.searchWrap}>
              <Icon name="search" size={18} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search ingredients"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search">
                  <Icon name="close" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <CategoryChips
              chips={chips}
              selected={category}
              total={shelf.length}
              onSelect={setCategory}
            />
          </View>
        )}

        {body()}

        {archived.length > 0 && (
          <TouchableOpacity
            style={styles.archiveLink}
            onPress={() => setIsArchiveOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.archiveText}>
              {archived.length} archived {archived.length === 1 ? "ingredient" : "ingredients"}
            </Text>
            <Icon name="chevron" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </ScrollView>

      <IngredientPickerSheet
        reason={picking}
        shelf={shelf}
        onPick={onPicked}
        onClose={() => {
          pendingPickRef.current = null;
          setPicking(null);
        }}
        onDismissed={onPickerDismissed}
      />

      <ArchivedIngredientsSheet
        visible={isArchiveOpen}
        rows={archived}
        onRestore={onRestore}
        onClose={() => setIsArchiveOpen(false)}
      />

      <TransferComposeSheet
        tenantId={tenantId ?? ""}
        visible={isComposing}
        branches={outlets}
        // The ACCOUNT's scope, not the branch being viewed: an owner drilled
        // into North is still an owner and may still send from anywhere. The
        // service re-checks this against `app_users` either way.
        scope={accountScope}
        onClose={() => setIsComposing(false)}
        onSend={onComposed}
      />

      {/*
        Reload from the server rather than patching the row in place: the write
        can cross a reorder line, which re-levels the ingredient and can 86 a
        dish, and none of that is knowable from the quantity alone.
      */}
      <StockMovementSheet
        tenantId={tenantId ?? ""}
        item={recording}
        outletId={outletId}
        openCountId={count?.id ?? null}
        initialReason={recordingReason}
        onClose={() => setRecording(null)}
        onRecorded={() => {
          // Both: the entry re-levels the ingredient AND advances the count's
          // coverage, and a panel still reading "0 of 40" after four counts
          // teaches the merchant the figure is decorative.
          load();
          loadCount();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.lg, paddingBottom: 48 },

  filters: { gap: spacing.md, marginTop: spacing.xs },
  sectionHead: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  sectionTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: colors.textPrimary },
  sectionCount: { fontSize: 14, fontWeight: "700", color: colors.textTertiary },
  clear: { marginLeft: "auto" },
  clearText: { ...typography.caption, color: colors.accent, fontWeight: "700" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md + 4,
    paddingHorizontal: spacing.lg,
    height: 48,
    ...shadow.sm,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary },

  list: { gap: spacing.sm + 2 },

  archiveLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
  },
  archiveText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
});

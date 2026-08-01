import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native";
import { useAuthStore } from "../../stores/auth-store";
import { useBranchScope, useAccountBranchScope } from "../../lib/use-branch-scope";
import { loadInventoryStock } from "../../lib/inventory-service";
import {
  filterStockViews,
  summarizeStock,
  type StockItemView,
  type StockLevel,
} from "../../lib/inventory-stock";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
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

type LevelFilter = StockLevel | "all";

/**
 * The three segments of the hero double as the filter. A merchant who reads
 * "2 out" and then wants to see which two should not have to look elsewhere for
 * the control — the count IS the button.
 */
const SEGMENTS: readonly { key: Exclude<LevelFilter, "all">; label: string; tint: string }[] = [
  { key: "out", label: "Out", tint: colors.danger },
  { key: "low", label: "Low", tint: colors.warning },
  { key: "ok", label: "Stocked", tint: colors.success },
];

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

  useEffect(() => {
    load();
  }, [load]);

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
  };

  const summary = useMemo(() => summarizeStock(shelf), [shelf]);
  const visible = useMemo(
    () => filterStockViews(shelf, { level: levelFilter, query: search }),
    [shelf, levelFilter, search],
  );

  // Tapping the active segment again clears it — the only way back to "all"
  // without a fourth chip competing for the same row.
  const toggleLevel = (key: LevelFilter) =>
    setLevelFilter((current) => (current === key ? "all" : key));

  const counts: Record<Exclude<LevelFilter, "all">, number> = {
    out: summary.outCount,
    low: summary.lowCount,
    ok: summary.okCount,
  };

  const body = () => {
    if (isLoading) return <LoadingState message="Loading your shelf..." />;
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (shelf.length === 0) {
      return (
        <EmptyState message="No ingredients yet. Add them in the web admin to start tracking stock." />
      );
    }
    if (visible.length === 0) {
      return <EmptyState message="Nothing matches that filter." />;
    }
    return (
      <View style={styles.list}>
        {visible.map((item) => (
          <InventoryStockCard key={item.id} item={item} onPress={setRecording} />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerWrap}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Inventory</Text>
            <Text style={styles.subtitle}>Tap an ingredient to record stock</Text>
          </View>
          <WorkspaceSwitcher />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Shelf status</Text>
          <Text style={styles.heroHeadline}>{summary.headline}</Text>

          <View style={styles.segments}>
            {SEGMENTS.map((segment) => {
              const isActive = levelFilter === segment.key;
              return (
                <TouchableOpacity
                  key={segment.key}
                  style={[styles.segment, isActive && styles.segmentActive]}
                  onPress={() => toggleLevel(segment.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${counts[segment.key]} ${segment.label}`}
                >
                  <View style={styles.segmentHead}>
                    <View style={[styles.dot, { backgroundColor: segment.tint }]} />
                    <Text style={styles.segmentCount}>{counts[segment.key]}</Text>
                  </View>
                  <Text style={styles.segmentLabel}>{segment.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {levelFilter !== "all" && (
            <TouchableOpacity onPress={() => setLevelFilter("all")} accessibilityRole="button">
              <Text style={styles.heroClear}>Showing one group — tap to show everything</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
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
            <TouchableOpacity onPress={() => setSearch("")} accessibilityRole="button">
              <Text style={styles.searchClear}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        <StockCountPanel
          progress={count?.progress ?? null}
          isBusy={countBusy}
          onStart={startCount}
          onFinish={finishCount}
        />

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

        {/*
          Outside the bench panel on purpose. That panel renders nothing until
          stock has moved, so a compose entry inside it would leave a store that
          has never transferred permanently unable to start one. Shown only to a
          store with somewhere to send to.
        */}
        {outlets.length > 1 && (
          <TouchableOpacity
            style={styles.compose}
            accessibilityRole="button"
            onPress={() => setIsComposing(true)}
          >
            <Text style={styles.composeLabel}>Move stock to another branch</Text>
          </TouchableOpacity>
        )}

        {body()}
      </ScrollView>

      {/*
        Reload from the server rather than patching the row in place: the write
        can cross a reorder line, which re-levels the ingredient and can 86 a
        dish, and none of that is knowable from the quantity alone.
      */}
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

      <StockMovementSheet
        tenantId={tenantId ?? ""}
        item={recording}
        outletId={outletId}
        openCountId={count?.id ?? null}
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
  headerWrap: {
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerText: { flex: 1 },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: 40 },

  hero: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.md,
  },
  heroEyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  heroHeadline: { fontSize: 20, fontWeight: "800", color: colors.heroInkText, lineHeight: 26 },
  segments: { flexDirection: "row", gap: spacing.sm },
  segment: {
    flex: 1,
    backgroundColor: colors.heroInkElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  segmentActive: { borderColor: colors.tabBarActive },
  segmentHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  segmentCount: { fontSize: 20, fontWeight: "800", color: colors.heroInkText },
  segmentLabel: { ...typography.small, color: colors.heroInkMuted },
  heroClear: { ...typography.caption, color: colors.tabBarActive },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    height: 46,
    ...shadow.sm,
  },
  searchIcon: { fontSize: 18, color: colors.textTertiary },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary },
  searchClear: { ...typography.caption, color: colors.accent, fontWeight: "600" },

  compose: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  composeLabel: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },

  list: { gap: spacing.md },
});

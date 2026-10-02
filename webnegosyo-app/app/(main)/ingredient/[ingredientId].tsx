import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../../../stores/auth-store";
import { useBranchScope } from "../../../lib/use-branch-scope";
import { loadInventoryStock } from "../../../lib/inventory-service";
import { formatStockQuantity, stockFillRatio, type StockItemView } from "../../../lib/inventory-stock";
import { valueOf } from "../../../lib/inventory-insights";
import {
  loadIngredientMovements,
  loadIngredientRecord,
  setIngredientActive,
} from "../../../lib/ingredient-service";
import {
  STORE_UTC_OFFSET_MINUTES,
  buildHistoryEntries,
  canShowRunningBalance,
  describeSince,
  formatEntryTime,
  groupHistoryByDay,
  lastReceivedAt,
  type HistoryTone,
  type MovementRow,
} from "../../../lib/stock-history";
import type { ManualMovementReason } from "../../../lib/inventory-movement";
import { ingredientEditorHref } from "../../../lib/navigation";
import { loadOpenCount } from "../../../lib/count-session-service";
import { formatPeso } from "../../../lib/format";
import { colors, typography, spacing, radius, shadow } from "../../../theme/colors";
import { BackHeader } from "../../../components/BackHeader";
import { IconButton } from "../../../components/IconButton";
import { Icon, type IconName } from "../../../components/Icon";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import { EmptyState } from "../../../components/EmptyState";
import { StockMovementSheet } from "../../../components/StockMovementSheet";
import { LEVEL_STYLE } from "../../../components/inventory/level-style";

/** Matches the shelf card: the reorder level sits at the bar's midpoint. */
const REORDER_MARK = "50%";

const ACTIONS: readonly { reason: ManualMovementReason; label: string; icon: IconName; ink: string; tint: string }[] = [
  { reason: "receive", label: "Receive", icon: "arrow-down", ink: colors.success, tint: colors.successLight },
  { reason: "stocktake", label: "Count", icon: "check", ink: colors.info, tint: colors.infoLight },
  { reason: "waste", label: "Waste", icon: "trash", ink: colors.danger, tint: colors.dangerLight },
];

const TONE_LOOK: Record<HistoryTone, { icon: IconName; ink: string; tint: string }> = {
  in: { icon: "arrow-down", ink: colors.success, tint: colors.successLight },
  out: { icon: "arrow-up", ink: colors.textSecondary, tint: colors.primaryLight },
  loss: { icon: "trash", ink: colors.danger, tint: colors.dangerLight },
  adjust: { icon: "check", ink: colors.info, tint: colors.infoLight },
};

type Missing = "archived" | "gone";

/**
 * One ingredient: how much is here, what it is worth, the three things to do
 * to it, and every movement that got it here.
 *
 * Quantities come from the same branch-aware shelf read as the Stock screen, so
 * the figure on this page can never disagree with the row that was tapped.
 */
export default function IngredientScreen() {
  const { ingredientId } = useLocalSearchParams<{ ingredientId: string }>();
  const tenantId = useAuthStore((s) => s.tenantId);
  const scope = useBranchScope();
  const outletId = scope.kind === "branch" ? scope.outletId : undefined;

  const [item, setItem] = useState<StockItemView | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Missing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [recording, setRecording] = useState<StockItemView | null>(null);
  const [reason, setReason] = useState<ManualMovementReason>("receive");
  const [isRestoring, setIsRestoring] = useState(false);
  const [openCountId, setOpenCountId] = useState<string | null>(null);
  // Which ingredient the figures on screen belong to.
  const shownIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !ingredientId) return;
    try {
      setError(null);
      const [shelf, count] = await Promise.all([
        loadInventoryStock(tenantId, outletId),
        // A count entered here while a session runs must be filed under it,
        // exactly as one entered from the shelf is.
        loadOpenCount(tenantId, outletId ?? null).catch(() => null),
      ]);
      setOpenCountId(count?.id ?? null);
      const found = shelf.find((view) => view.id === ingredientId) ?? null;
      setItem(found);
      shownIdRef.current = ingredientId;

      if (!found) {
        // The shelf drops archived rows, so ask the row itself which it is.
        const record = await loadIngredientRecord(tenantId, ingredientId);
        setMissing(record && !record.is_active ? "archived" : "gone");
        return;
      }
      setMissing(null);

      try {
        setHistoryError(null);
        setMovements(await loadIngredientMovements(tenantId, ingredientId, outletId));
      } catch (historyFailure) {
        // The history failing costs the timeline, not the page.
        setHistoryError(historyFailure instanceof Error ? historyFailure.message : "Could not load the history.");
      }
    } catch {
      setError("Could not load this ingredient. Pull down to try again.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, ingredientId, outletId]);

  // Tab screens stay mounted: reload on every focus, and on a new id.
  useFocusEffect(
    useCallback(() => {
      // A different ingredient must never flash the previous one's figures.
      if (shownIdRef.current !== ingredientId) {
        setItem(null);
        setMovements([]);
        setMissing(null);
        setIsLoading(true);
      }
      load();
    }, [load, ingredientId]),
  );

  const groups = useMemo(() => {
    const entries = buildHistoryEntries(movements, item?.unitAbbreviation ?? "");
    return groupHistoryByDay(entries, { now: new Date(), utcOffsetMinutes: STORE_UTC_OFFSET_MINUTES });
  }, [movements, item?.unitAbbreviation]);
  const showBalance = canShowRunningBalance(movements, outletId);
  const lastIn = describeSince(lastReceivedAt(movements), {
    now: new Date(),
    utcOffsetMinutes: STORE_UTC_OFFSET_MINUTES,
  });

  const restore = async () => {
    if (!tenantId || !ingredientId) return;
    setIsRestoring(true);
    try {
      await setIngredientActive(tenantId, ingredientId, true);
      await load();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "That did not restore.");
    } finally {
      setIsRestoring(false);
    }
  };

  const openEditor = () => {
    if (ingredientId) router.push(ingredientEditorHref(ingredientId));
  };

  const record = (next: ManualMovementReason) => {
    if (!item) return;
    setReason(next);
    setRecording(item);
  };

  const content = () => {
    if (isLoading && !item) return <LoadingState message="Loading ingredient..." />;
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (missing === "archived") {
      return (
        <EmptyState
          icon="stock"
          title="This ingredient is archived"
          message="It is hidden from the shelf and from counts. Its history is kept."
          actionLabel={isRestoring ? "Restoring..." : "Restore it"}
          onAction={isRestoring ? undefined : restore}
        />
      );
    }
    if (!item) {
      return (
        <EmptyState
          icon="stock"
          title="Ingredient not found"
          message="It may have been deleted on the web."
          actionLabel="Back to stock"
          onAction={() => router.back()}
        />
      );
    }

    const level = LEVEL_STYLE[item.level];
    const ratio = stockFillRatio(item);
    const hasThreshold = item.reorderLevel > 0;
    const unitCost = item.unitCost ?? 0;
    const unitLabel = item.unitAbbreviation || "unit";

    return (
      <>
        <View style={styles.gaugeCard}>
          <View style={styles.gaugeTop}>
            <View style={[styles.levelChip, { backgroundColor: level.tint }]}>
              <View style={[styles.levelDot, { backgroundColor: level.fill }]} />
              <Text style={[styles.levelText, { color: level.text }]}>
                {item.level === "ok" ? "In stock" : item.level === "low" ? "Running low" : "Out of stock"}
              </Text>
            </View>
            {item.isPrep && <Text style={styles.prepTag}>MADE IN-HOUSE</Text>}
          </View>

          <View style={styles.figureRow}>
            <Text
              style={[styles.figure, item.quantity < 0 && { color: colors.danger }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatStockQuantity(item.quantity, "")}
            </Text>
            <Text style={styles.figureUnit}>{item.unitAbbreviation}</Text>
          </View>
          <Text style={styles.figureCaption}>
            {scope.kind === "branch" ? "On this branch's shelf" : "On hand"}
          </Text>

          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: level.fill }]} />
            {hasThreshold && <View style={[styles.reorderMark, { left: REORDER_MARK }]} />}
          </View>
          <View style={styles.trackLegend}>
            <Text style={styles.legendText}>Empty</Text>
            {hasThreshold ? (
              <Text style={styles.legendText}>
                Reorder at {formatStockQuantity(item.reorderLevel, item.unitAbbreviation)}
              </Text>
            ) : (
              <TouchableOpacity onPress={openEditor} accessibilityRole="button">
                <Text style={styles.legendLink}>Set a reorder level</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.actions}>
          {ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.reason}
              style={styles.action}
              onPress={() => record(action.reason)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View style={[styles.actionBadge, { backgroundColor: action.tint }]}>
                <Icon name={action.icon} size={18} color={action.ink} strokeWidth={2} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.stats}>
          <Stat label="Stock value" value={unitCost > 0 ? formatPeso(valueOf(item)) : "—"} />
          <Stat
            label={`Cost per ${unitLabel}`}
            value={unitCost > 0 ? formatPeso(unitCost) : "Not set"}
            isMuted={unitCost <= 0}
            onPress={unitCost > 0 ? undefined : openEditor}
          />
          <Stat
            label="Reorder level"
            value={hasThreshold ? formatStockQuantity(item.reorderLevel, item.unitAbbreviation) : "Not set"}
            isMuted={!hasThreshold}
          />
          <Stat label="Last delivery" value={lastIn} isMuted={lastIn === "Never"} />
        </View>

        <View style={styles.historyHead}>
          <Text style={styles.sectionTitle}>History</Text>
          {movements.length > 0 && <Text style={styles.sectionCount}>{movements.length}</Text>}
        </View>

        {historyError ? (
          <Text style={styles.historyError}>{historyError}</Text>
        ) : groups.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Text style={styles.historyEmptyTitle}>No stock has moved yet</Text>
            <Text style={styles.historyEmptyText}>
              Deliveries, counts, waste and sales will appear here.
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.title} style={styles.dayGroup}>
              <Text style={styles.dayTitle}>{group.title}</Text>
              <View style={styles.dayCard}>
                {group.entries.map((entry, position) => {
                  const look = TONE_LOOK[entry.tone];
                  const detail = [
                    formatEntryTime(entry.createdAt, STORE_UTC_OFFSET_MINUTES),
                    entry.fromOrder ? "From an order" : null,
                    entry.note,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <View
                      key={entry.id}
                      style={[styles.entry, position > 0 && styles.entryDivider]}
                    >
                      <View style={[styles.entryBadge, { backgroundColor: look.tint }]}>
                        <Icon name={look.icon} size={15} color={look.ink} strokeWidth={2} />
                      </View>
                      <View style={styles.entryCopy}>
                        <Text style={styles.entryLabel}>{entry.label}</Text>
                        <Text style={styles.entryDetail} numberOfLines={2}>
                          {detail}
                        </Text>
                      </View>
                      <View style={styles.entryFigures}>
                        <Text
                          style={[
                            styles.entryDelta,
                            { color: entry.tone === "in" ? colors.success : entry.tone === "loss" ? colors.danger : colors.textPrimary },
                          ]}
                        >
                          {entry.delta}
                        </Text>
                        {showBalance && <Text style={styles.entryBalance}>{entry.balance}</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </>
    );
  };

  return (
    <View style={styles.screen}>
      <BackHeader
        title={item?.name ?? "Ingredient"}
        subtitle={item?.category?.trim() || undefined}
        actions={item ? <IconButton icon="edit" label="Edit ingredient" onPress={openEditor} /> : undefined}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {content()}
      </ScrollView>

      <StockMovementSheet
        tenantId={tenantId ?? ""}
        item={recording}
        outletId={outletId}
        openCountId={openCountId}
        initialReason={reason}
        onClose={() => setRecording(null)}
        onRecorded={load}
      />
    </View>
  );
}

interface StatProps {
  label: string;
  value: string;
  isMuted?: boolean;
  onPress?: () => void;
}

function Stat({ label, value, isMuted, onPress }: StatProps) {
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container style={styles.stat} onPress={onPress} accessibilityRole={onPress ? "button" : undefined}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, isMuted && styles.statMuted]} numberOfLines={1}>
        {value}
      </Text>
      {onPress && <Text style={styles.statLink}>Add</Text>}
    </Container>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.xs, gap: spacing.lg, paddingBottom: 48 },

  gaugeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg + 4,
    padding: spacing.xl,
    ...shadow.md,
  },
  gaugeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  levelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  levelDot: { width: 7, height: 7, borderRadius: radius.full },
  levelText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
  prepTag: { ...typography.eyebrow, fontSize: 10, color: colors.textTertiary },
  figureRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.lg },
  figure: { fontSize: 54, fontWeight: "800", letterSpacing: -2, color: colors.textPrimary, flexShrink: 1 },
  figureUnit: { fontSize: 22, fontWeight: "700", color: colors.textSecondary },
  figureCaption: { ...typography.caption, color: colors.textSecondary, marginTop: -2 },
  track: {
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    overflow: "hidden",
    marginTop: spacing.xl,
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.full },
  reorderMark: { position: "absolute", width: 2, top: 0, bottom: 0, backgroundColor: colors.card },
  trackLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  legendText: { ...typography.small, color: colors.textTertiary, fontWeight: "600" },
  legendLink: { ...typography.small, color: colors.accent, fontWeight: "700" },

  actions: { flexDirection: "row", gap: spacing.sm },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    ...shadow.sm,
  },
  actionBadge: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },

  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
  },
  statLabel: { ...typography.eyebrow, fontSize: 10, color: colors.textTertiary },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.3 },
  statMuted: { color: colors.textTertiary, fontWeight: "700" },
  statLink: { ...typography.small, color: colors.accent, fontWeight: "700" },

  historyHead: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.sm },
  sectionTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: colors.textPrimary },
  sectionCount: { fontSize: 14, fontWeight: "700", color: colors.textTertiary },
  historyError: { ...typography.caption, color: colors.danger },
  historyEmpty: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: 4,
  },
  historyEmptyTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  historyEmptyText: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },

  dayGroup: { gap: spacing.sm },
  dayTitle: { ...typography.eyebrow, color: colors.textSecondary },
  dayCard: { backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  entry: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  entryDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  entryBadge: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  entryCopy: { flex: 1, gap: 1 },
  entryLabel: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  entryDetail: { fontSize: 12, color: colors.textSecondary },
  entryFigures: { alignItems: "flex-end" },
  entryDelta: { fontSize: 15, fontWeight: "800" },
  entryBalance: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
});

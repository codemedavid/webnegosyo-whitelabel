import React, { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { LoadingState } from "../../components/LoadingState";
import { DrawerEditorSheet } from "../../components/drawer/DrawerEditorSheet";
import { archiveDrawer, createDrawer, listDrawers, updateDrawer } from "../../lib/cash-drawer-service";
import {
  canManageCash,
  describeDrawerPolicy,
  suggestDrawerName,
  type CashDrawer,
  type DrawerInput,
} from "../../lib/cash-drawers";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { formatPeso } from "../../lib/format";
import { resolveRegisterOutlet } from "../../lib/register-outlet";
import { listOpenShifts, type ShiftRecord } from "../../lib/shift-service";
import { useAuthStore } from "../../stores/auth-store";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { colors, radius, spacing, typography } from "../../theme/colors";

type Editing = { drawer: CashDrawer | null } | null;

const HOW_IT_WORKS = [
  "Each cashier clocks in to one drawer and counts it at close.",
  "A float drawer keeps its starting cash for the next shift.",
  "A zero-balance drawer starts empty and hands over everything.",
  "Collect cash from any drawer on the Drawer screen, under All drawers.",
] as const;

/**
 * Cash drawers: the tills of this branch.
 *
 * A store with one till needs none of this — a shift without a drawer is the
 * cashier's own. Add "Cashier 1" and "Cashier 2" when two people ring sales
 * at once, so each count belongs to one cash box; mark a till zero-balance
 * when it should start empty and hand everything over at close.
 */
export default function CashDrawersScreen() {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const selectedOutletName = useBranchContextStore((s) => s.selectedOutletName);
  const canManage = canManageCash({ role, isOwner, permissions });

  const [drawers, setDrawers] = useState<CashDrawer[] | null>(null);
  const [openShifts, setOpenShifts] = useState<ShiftRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsBranch, setNeedsBranch] = useState(false);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const selection = useBranchContextStore.getState();
    const outlet = resolveRegisterOutlet(useAuthStore.getState(), selection);
    const branchMissing = (selection.knownOutletIds?.length ?? 0) > 0 && !outlet;
    setNeedsBranch(branchMissing);
    if (branchMissing) {
      setDrawers([]);
      return;
    }
    const id = outlet?.id ?? null;
    setOutletId(id);
    try {
      const [tills, open] = await Promise.all([listDrawers(tenantId, id), listOpenShifts(tenantId, id)]);
      setDrawers(tills);
      setOpenShifts(open);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The drawers could not be read.");
    }
  }, [tenantId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const guard = (): boolean => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return false;
    }
    return Boolean(tenantId) && !busy;
  };

  const save = async (input: DrawerInput) => {
    if (!guard() || !tenantId || !editing) return;
    setBusy(true);
    try {
      const siblings = drawers ?? [];
      if (editing.drawer) await updateDrawer(tenantId, editing.drawer.id, input, siblings);
      else await createDrawer(tenantId, outletId, input, siblings);
      setEditing(null);
      await load();
    } catch (saveError) {
      Alert.alert("Could not save the drawer", saveError instanceof Error ? saveError.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const archive = (drawer: CashDrawer) => {
    if (!guard() || !tenantId) return;
    Alert.alert(`Remove ${drawer.name}?`, "Its past shifts stay in the history. Nobody can clock in to it after this.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await archiveDrawer(tenantId, drawer.id);
            setEditing(null);
            await load();
          } catch (archiveError) {
            Alert.alert("Could not remove it", archiveError instanceof Error ? archiveError.message : "Try again.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const holderOf = (drawerId: string) => openShifts.find((s) => s.drawerId === drawerId) ?? null;

  if (!canManage) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Cash drawers" />
        <EmptyState icon="drawer" title="Owner setting" message="Only the owner or a manager can set up cash drawers." />
      </View>
    );
  }

  let body: React.ReactNode;
  if (drawers === null && !error) body = <LoadingState />;
  else if (error && drawers === null) body = <ErrorState message={error} onRetry={() => void load()} />;
  else if (needsBranch) {
    body = <EmptyState icon="drawer" title="Choose a branch" message="Drawers belong to one branch. Pick it on the branch bar first." />;
  } else {
    const list = drawers ?? [];
    body = (
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
      >
        <View style={styles.explainer}>
          <Text style={styles.explainerTitle}>How drawers work</Text>
          {HOW_IT_WORKS.map((line) => (
            <View key={line} style={styles.explainerRow}>
              <Icon name="check" size={14} color={colors.success} />
              <Text style={styles.explainerLine}>{line}</Text>
            </View>
          ))}
        </View>

        {list.length === 0 ? (
          <EmptyState
            icon="drawer"
            title="No drawers yet"
            message="Cashiers each count their own personal drawer. Add drawers when two people share the counter."
            inset
          />
        ) : (
          <View style={styles.group}>
            {list.map((drawer, index) => {
              const holder = holderOf(drawer.id);
              return (
                <TouchableOpacity
                  key={drawer.id}
                  style={[styles.row, index < list.length - 1 && styles.rowDivider]}
                  onPress={() => setEditing({ drawer })}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${drawer.name}`}
                >
                  <View style={[styles.rowIcon, drawer.isZeroBalance && styles.rowIconZero]}>
                    <Icon name="drawer" size={18} color={drawer.isZeroBalance ? colors.textOnDark : colors.textPrimary} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{drawer.name}</Text>
                    <Text style={styles.rowMeta}>{describeDrawerPolicy(drawer, formatPeso)}</Text>
                  </View>
                  {holder ? (
                    <View style={styles.inUse}>
                      <Text style={styles.inUseText} numberOfLines={1}>
                        {holder.staffName}
                      </Text>
                    </View>
                  ) : null}
                  <Icon name="chevron" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Button
          label={list.length === 0 ? "Add Cashier 1" : `Add ${suggestDrawerName(list)}`}
          icon="plus"
          onPress={() => setEditing({ drawer: null })}
          size="lg"
          fullWidth
          style={styles.add}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <BackHeader title="Cash drawers" subtitle={selectedOutletName ?? "Tills, floats and zero-balance"} />
      {body}
      {editing ? (
        <DrawerEditorSheet
          key={editing.drawer?.id ?? "new"}
          drawer={editing.drawer}
          suggestedName={suggestDrawerName(drawers ?? [])}
          siblings={drawers ?? []}
          isInUse={editing.drawer ? Boolean(holderOf(editing.drawer.id)) : false}
          isBusy={busy}
          onSave={(input) => void save(input)}
          onArchive={() => editing.drawer && archive(editing.drawer)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  explainer: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  explainerTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: 4 },
  explainerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  explainerLine: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, minHeight: 64 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.separator },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconZero: { backgroundColor: colors.accent },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  rowMeta: { ...typography.caption, color: colors.textSecondary },
  inUse: {
    backgroundColor: colors.successLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    maxWidth: 120,
  },
  inUseText: { ...typography.small, fontWeight: "700", color: colors.success },
  add: { marginTop: spacing.sm },
});

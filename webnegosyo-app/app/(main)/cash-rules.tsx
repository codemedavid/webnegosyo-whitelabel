import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { BackHeader } from "../../components/BackHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { LoadingState } from "../../components/LoadingState";
import { BusinessDaySection, type SaveCutoffResult } from "../../components/cash-rules/BusinessDaySection";
import { CashRulesForm, type SaveRulesResult } from "../../components/cash-rules/CashRulesForm";
import { ReceiversSection, type Receiver } from "../../components/cash-rules/ReceiversSection";
import { ServicePeriodSheet } from "../../components/cash-rules/ServicePeriodSheet";
import { ShiftsSection } from "../../components/cash-rules/ShiftsSection";
import { resourceKey } from "../../lib/backends/query-keys";
import { cutoffMinutesFor } from "../../lib/business-day/trading-day";
import { useTradingDay } from "../../lib/business-day/use-trading-day";
import { suggestCutoff } from "../../lib/cash/cutoff-suggestion";
import { cashRulesAccess, pendingCutoff, receiversOf } from "../../lib/cash/rules-form";
import {
  archiveServicePeriod,
  createServicePeriod,
  updateServicePeriod,
  type ServicePeriod,
  type ServicePeriodInput,
} from "../../lib/cash/service-periods";
import { DEFAULT_CASH_SETTINGS, saveCashSettings, setBusinessDayCutoff, type CashSettingsPatch } from "../../lib/cash/settings";
import {
  liveCashDb,
  useCashRulesRefresh,
  useCashSettings,
  useOrderHours,
  useServicePeriods,
} from "../../lib/cash/use-cash-rules";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { useManageStaff } from "../../lib/manage-staff-client";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { useResource } from "../../lib/query/use-resource";
import { hasPermission } from "../../lib/staff-permissions";
import { canOpenTeam, listStaff } from "../../lib/staff-service";
import { useOutlets } from "../../lib/use-outlets";
import { useAuthStore } from "../../stores/auth-store";
import { colors, radius, spacing, typography } from "../../theme/colors";

type Editing = { period: ServicePeriod | null } | null;

const message = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

/**
 * Shift & remit rules (06 §4.6, mockup 10) — a utility route (href: null)
 * opened from Manage, Cash drawers. Store-wide, so a branch-locked account
 * never gets it; the business day needs the owner or `settings`, the cash
 * rules and named shifts need `cash_manage` (cashRulesAccess). Every write
 * goes through lib/cash/* and refreshes the shared cache.
 */
export default function CashRulesScreen() {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const tenantName = useAuthStore((s) => s.tenantName);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const outletId = useAuthStore((s) => s.outletId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const viewer = { role, isOwner, permissions, outletId, isDemo };
  const access = cashRulesAccess(viewer);
  const isLive = access.canOpen && !isDemo;
  const showTeam = canOpenTeam(viewer);

  const refreshCache = useCashRulesRefresh(tenantId);
  const { status } = useConnectivity();
  const isOffline = status === "offline";
  const { outlets } = useOutlets();
  const invokeManageStaff = useManageStaff();

  const settingsQuery = useCashSettings(isLive ? tenantId : null);
  const periodsQuery = useServicePeriods(isLive ? tenantId : null);
  const day = useTradingDay();
  const currentCutoff = cutoffMinutesFor(day.schedule, day.todayKey);
  const pending = pendingCutoff(day.schedule, day.todayKey);
  const canSuggest =
    isLive && access.canEditCutoff && orderBackend === "platform" && hasPermission(viewer, "reports");
  const hours = useOrderHours(tenantId, canSuggest);
  const suggestion = hours.data && !pending ? suggestCutoff(hours.data, currentCutoff) : null;

  const staffFetcher = useCallback(() => listStaff(invokeManageStaff), [invokeManageStaff]);
  const staffQuery = useResource(isLive && showTeam && tenantId ? resourceKey("cash-receivers", tenantId) : null, staffFetcher);
  const receivers = useMemo<Receiver[] | null>(() => {
    if (!staffQuery.data) return null;
    return receiversOf(staffQuery.data).map((member) => ({
      userId: member.userId,
      name: member.displayName ?? member.email ?? "Staff",
      isOwner: member.isOwner,
      branch: member.outletId ? outlets.find((o) => o.id === member.outletId)?.name ?? "One branch" : null,
    }));
  }, [staffQuery.data, outlets]);

  const [editing, setEditing] = useState<Editing>(null);
  const [isBusy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [isRefreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([settingsQuery.refetch(), periodsQuery.refetch()]);
    await refreshCache.cutoffSchedule();
    setRefreshing(false);
  };

  const saveCutoff = async (minutes: number): Promise<SaveCutoffResult> => {
    if (!tenantId) return { ok: false, error: "No store is signed in." };
    try {
      const effectiveFrom = await setBusinessDayCutoff(liveCashDb, tenantId, minutes);
      await refreshCache.cutoffSchedule();
      return { ok: true, effectiveFrom };
    } catch (error) {
      return { ok: false, error: message(error, "The business day could not be changed.") };
    }
  };

  const saveRules = async (patch: CashSettingsPatch): Promise<SaveRulesResult> => {
    if (!tenantId) return { ok: false, error: "No store is signed in." };
    try {
      await saveCashSettings(liveCashDb, tenantId, patch);
      await refreshCache.settings();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: message(error, "The rules could not be saved.") };
    }
  };

  const savePeriod = async (input: ServicePeriodInput) => {
    if (!tenantId || !editing || isOffline) {
      setSheetError(isOffline ? "You're offline. Connect to save." : null);
      return;
    }
    setBusy(true);
    setSheetError(null);
    try {
      const siblings = periodsQuery.data ?? [];
      if (editing.period) await updateServicePeriod(liveCashDb, tenantId, editing.period.id, input, siblings);
      else await createServicePeriod(liveCashDb, tenantId, input, siblings);
      await refreshCache.servicePeriods();
      setEditing(null);
    } catch (error) {
      setSheetError(message(error, "The shift could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const archivePeriod = (period: ServicePeriod) => {
    if (!tenantId) return;
    Alert.alert(`Remove ${period.name}?`, "Past shift reports keep its name. It stops showing for new shifts.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await archiveServicePeriod(liveCashDb, tenantId, period.id);
            await refreshCache.servicePeriods();
            setEditing(null);
          } catch (error) {
            setSheetError(message(error, "The shift could not be removed."));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const cutoffLockedReason = (() => {
    if (isDemo) return DEMO_READONLY_MESSAGE;
    if (!access.canEditCutoff) return "Only the owner or someone with Settings can change when the business day ends.";
    if (day.isFallback) return "Couldn't load your business day setting. Pull down to try again.";
    if (isOffline) return "You're offline. Connect to change it.";
    return null;
  })();

  const header = <BackHeader title="Shift & remit rules" subtitle={`${tenantName ?? "Your store"} · every branch`} />;

  if (!access.canOpen) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          icon="drawer"
          title="For the owner and cash managers"
          message="These rules are store-wide. Ask the owner, or someone with Cash & day close, to change them."
        />
      </View>
    );
  }

  const settings = isLive ? settingsQuery.data : DEFAULT_CASH_SETTINGS;
  let body: React.ReactNode;
  if (isLive && settingsQuery.isLoading) {
    body = <LoadingState message="Loading rules..." />;
  } else if (!settings) {
    body = (
      <ErrorState title="Couldn't load the rules" message={settingsQuery.error ?? undefined} onRetry={() => void settingsQuery.refetch()} />
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={isLive ? <RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} /> : undefined}
      >
        {isDemo ? (
          <View style={styles.banner} accessibilityRole="alert">
            <Icon name="info" size={16} color={colors.textPrimary} />
            <Text style={styles.bannerText}>{DEMO_READONLY_MESSAGE}</Text>
          </View>
        ) : null}
        {day.isLoading ? (
          <LoadingState message="Loading your business day..." />
        ) : (
          <BusinessDaySection
            currentCutoff={currentCutoff}
            pending={pending}
            isFallback={day.isFallback}
            canEdit={access.canEditCutoff && !isOffline}
            lockedReason={cutoffLockedReason}
            suggestion={suggestion}
            onSave={saveCutoff}
          />
        )}
        <CashRulesForm settings={settings} canEdit={access.canEditRules && !isOffline} isOffline={isOffline}
          isPlatformStore={orderBackend === "platform"}
          onSave={saveRules}
        >
          <ShiftsSection
            periods={isLive ? periodsQuery.data ?? null : []}
            error={periodsQuery.error}
            branches={outlets}
            canEdit={access.canEditRules && !isOffline}
            onAdd={() => {
              setSheetError(null);
              setEditing({ period: null });
            }}
            onEdit={(period) => {
              setSheetError(null);
              setEditing({ period });
            }}
            onRetry={() => void periodsQuery.refetch()}
          />
          <ReceiversSection receivers={receivers} canOpenTeam={showTeam} onOpenTeam={() => router.push("/(main)/team")} />
        </CashRulesForm>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      {body}
      {editing ? (
        <ServicePeriodSheet
          period={editing.period}
          siblings={periodsQuery.data ?? []}
          branches={outlets}
          isBusy={isBusy}
          error={sheetError}
          onSave={(input) => void savePeriod(input)}
          onArchive={() => editing.period && archivePeriod(editing.period)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  banner: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoLight,
  },
  bannerText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
});

import React, { useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ListRow } from "../../components/ListRow";
import { LoadingState } from "../../components/LoadingState";
import { DayCloseChecklist } from "../../components/cash/DayCloseChecklist";
import { dayCloseReadiness } from "../../components/cash/day-close-checklist";
import { DayCloseSummary } from "../../components/day-close/DayCloseSummary";
import { DepositSheet } from "../../components/day-close/DepositSheet";
import { NoteSheet, type NoteResult } from "../../components/day-close/NoteSheet";
import { ForceCloseShiftSheet } from "../../components/remittances/ForceCloseShiftSheet";
import { useTradingDay } from "../../lib/business-day/use-trading-day";
import { printDayCloseSlip, shareDayCloseSlip } from "../../lib/cash-slips/slip-print";
import { REMITTANCES_ROUTE, dayCloseHref, shiftSalesHref } from "../../lib/cash-routes";
import { closeBusinessDay, recordDayDeposit, reopenBusinessDay, DAY_CLOSE_COPY, type DayCloseRecord } from "../../lib/cash/day-close";
import { closeNoteOf, closeTitle, historyRowOf, skippedOf, slipInputOf, windowLine } from "../../lib/cash/day-close-view";
import { pickAndUploadDepositPhoto } from "../../lib/cash/deposit-photo";
import { formatDayKey } from "../../lib/cash/rules-form";
import { DEFAULT_CASH_SETTINGS } from "../../lib/cash/settings";
import { liveCashDb, useCashSettings } from "../../lib/cash/use-cash-rules";
import { useDayCloseRefresh, useDayCloseStatus, useDayCloses } from "../../lib/cash/use-day-close";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { isTabAllowed } from "../../lib/staff-permissions";
import { useAuthStore } from "../../stores/auth-store";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { colors, radius, spacing, typography } from "../../theme/colors";

type Sheet = { kind: "closeAnyway" } | { kind: "reopen" } | { kind: "deposit" } | { kind: "endShift"; shiftId: string } | null;

const failure = (error: unknown, fallback: string): NoteResult => ({ ok: false, error: error instanceof Error ? error.message : fallback });
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Day close (06 §4.5) — `day-close?day=<key>&outlet=<id>`, or the history of
 * closes without a day. For cash managers (TAB_PERMISSIONS "day-close").
 * The checklist blocks only on an open shift; anything else is "Close
 * anyway" with a note naming what was skipped. Closed days are frozen; the
 * owner may reopen within 31 days, and the deposit is recorded once.
 */
export default function DayCloseScreen() {
  const params = useLocalSearchParams<{ day?: string; outlet?: string }>();
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const tenantName = useAuthStore((s) => s.tenantName);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);
  const permissions = useAuthStore((s) => s.permissions);
  const accountOutletId = useAuthStore((s) => s.outletId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const selectedOutletId = useBranchContextStore((s) => s.selectedOutletId);
  const branchName = useBranchContextStore((s) => s.selectedOutletName);
  const isAllowed = isTabAllowed({ role, isOwner, permissions }, "day-close");
  const isLive = isAllowed && !isDemo;
  const canReopen = isOwner || isSuperadmin;

  const dayKey = typeof params.day === "string" && DAY_KEY.test(params.day) ? params.day : null;
  // A branch account always closes its own branch, whatever the link says.
  const outletId = accountOutletId ?? (typeof params.outlet === "string" ? params.outlet : null) ?? selectedOutletId ?? null;

  const { status: connectivity } = useConnectivity();
  const isOffline = connectivity === "offline";
  const { todayKey } = useTradingDay();
  const settings = useCashSettings(isLive ? tenantId : null);
  const statusQuery = useDayCloseStatus(tenantId, outletId, dayKey, isLive);
  const closesQuery = useDayCloses(tenantId, isLive);
  const refresh = useDayCloseRefresh(tenantId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [isClosing, setClosing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const status = statusQuery.data ?? null;
  const record = useMemo<DayCloseRecord | null>(() => {
    if (!status?.existingClose) return null;
    return closesQuery.data?.find((close) => close.id === status.existingClose?.id) ?? null;
  }, [status, closesQuery.data]);
  const isClosed = status?.existingClose?.status === "closed";
  const remittanceMode = (settings.data ?? DEFAULT_CASH_SETTINGS).remittanceMode;
  const readiness = status ? dayCloseReadiness(status, remittanceMode) : null;
  const store = { storeName: tenantName ?? "Store", branchName: branchName ?? undefined };

  const runClose = async (note: string | null, force: boolean): Promise<NoteResult> => {
    if (!tenantId || !dayKey) return { ok: false, error: "No day picked." };
    try {
      await closeBusinessDay(liveCashDb, { tenantId, outletId, dayKey, note, force });
      await refresh();
      setSheet(null);
      return { ok: true };
    } catch (error) {
      return failure(error, "The day could not be closed.");
    }
  };

  const close = async () => {
    if (!readiness) return;
    if (readiness.needsConfirm) {
      setSheet({ kind: "closeAnyway" });
      return;
    }
    setClosing(true);
    const result = await runClose(null, false);
    setClosing(false);
    setMessage(result.ok ? null : result.error);
  };

  const print = async (action: "print" | "share") => {
    if (!record) return;
    const input = slipInputOf(record, skippedOf(record));
    if (!input) return;
    if (action === "share") {
      await shareDayCloseSlip(input, store);
      return;
    }
    const outcome = await printDayCloseSlip(input, store);
    if (!outcome.ok) Alert.alert("Could not print", outcome.message);
  };

  const title = dayKey ? closeTitle(dayKey) : "Day closes";
  const subtitle = dayKey ? windowLine(dayKey, status?.windowStart ?? null, status?.windowEnd ?? null) : branchName ?? "Every business day you closed";
  const header = <BackHeader title={title} subtitle={subtitle} />;

  if (!isAllowed) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState icon="calendar" title="For cash managers" message="Ask the owner for Cash & day close to close the day." />
      </View>
    );
  }
  if (isDemo) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState icon="calendar" title="Demo store" message={DEMO_READONLY_MESSAGE} />
      </View>
    );
  }

  // ── History (no day picked) ────────────────────────────────────────────
  if (!dayKey) {
    let history: React.ReactNode;
    if (closesQuery.isLoading) history = <LoadingState message="Loading day closes..." />;
    else if (closesQuery.error && !closesQuery.data) {
      history = <ErrorState title="Couldn't load day closes" message={closesQuery.error} onRetry={() => void closesQuery.refetch()} />;
    } else {
      const rows = closesQuery.data ?? [];
      history = (
        <ScrollView contentContainerStyle={styles.content}>
          <Button label={closeTitle(todayKey)} icon="calendar" size="lg" fullWidth onPress={() => router.push(dayCloseHref(todayKey, outletId))} />
          {rows.length === 0 ? (
            <EmptyState icon="calendar" title="No days closed yet" message="Close a business day to see it here." inset />
          ) : (
            <View style={styles.group}>
              {rows.map((row, index) => {
                const view = historyRowOf(row);
                return (
                  <ListRow
                    key={view.key}
                    icon="calendar"
                    title={view.title}
                    subtitle={view.detail}
                    onPress={() => router.push(dayCloseHref(row.businessDay, row.outletId))}
                    grouped={index < rows.length - 1}
                  />
                );
              })}
            </View>
          )}
        </ScrollView>
      );
    }
    return (
      <View style={styles.screen}>
        {header}
        {history}
      </View>
    );
  }

  // ── One day ────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (statusQuery.isLoading) body = <LoadingState message={`Adding up ${formatDayKey(dayKey)}...`} />;
  else if (!status) {
    body = <ErrorState title="Couldn't load this day" message={statusQuery.error ?? undefined} onRetry={() => void statusQuery.refetch()} />;
  } else {
    const snapshot = isClosed ? record?.snapshot ?? status.preview : status.preview;
    const isDrawersOnly = (isClosed ? record?.salesSource === "drawers_only" : false) || snapshot?.sales === null;
    const hasShifts = (snapshot?.shifts.length ?? 0) + status.openShifts.length > 0;
    body = (
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={statusQuery.isRefetching} onRefresh={() => void refresh()} />}
      >
        {isOffline ? <Text style={styles.note}>{`${DAY_CLOSE_COPY.offline} You can read the day, but not close it.`}</Text> : null}
        {isClosed ? (
          <Text style={styles.closedLine}>
            {`Closed by ${status.existingClose?.closedByName ?? "staff"}${(status.existingClose?.version ?? 1) > 1 ? ` (version ${status.existingClose?.version})` : ""}`}
          </Text>
        ) : hasShifts ? (
          <DayCloseChecklist
            status={status}
            endedShiftCount={status.preview?.shifts.length}
            onEndShift={(shiftId) => setSheet({ kind: "endShift", shiftId })}
            onReviewRemittances={() => router.push(REMITTANCES_ROUTE)}
            onReviewNonCash={(shiftId) => router.push(shiftSalesHref(shiftId))}
            isOffline={isOffline}
          />
        ) : null}

        {!hasShifts && !isClosed ? (
          <EmptyState icon="calendar" title="Nothing to close" message={`No shifts on ${formatDayKey(dayKey)}.`} inset />
        ) : snapshot ? (
          <DayCloseSummary snapshot={snapshot} isDrawersOnly={isDrawersOnly} />
        ) : null}

        {message ? (
          <Text style={styles.error} accessibilityRole="alert">
            {message}
          </Text>
        ) : null}

        {!isClosed && hasShifts ? (
          <Button
            label={closeTitle(dayKey)}
            size="lg"
            fullWidth
            onPress={() => void close()}
            isLoading={isClosing}
            disabled={isOffline || !readiness?.canClose}
            accessibilityHint={readiness?.canClose ? undefined : "End every open shift first"}
          />
        ) : null}

        {isClosed && record ? (
          <View style={styles.actions}>
            {!record.deposit ? (
              <Button label="Record the deposit" icon="wallet" size="lg" fullWidth onPress={() => setSheet({ kind: "deposit" })} disabled={isOffline} />
            ) : (
              <Text style={styles.note}>{historyRowOf(record).detail}</Text>
            )}
            <View style={styles.row}>
              <Button label="Print day close" icon="printer" tone="secondary" onPress={() => void print("print")} style={styles.flex} />
              <Button label="Share" icon="export" tone="secondary" onPress={() => void print("share")} style={styles.flex} />
            </View>
            {canReopen ? <Button label="Reopen this day" tone="ghost" fullWidth onPress={() => setSheet({ kind: "reopen" })} disabled={isOffline} /> : null}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  const openShift = sheet?.kind === "endShift" ? status?.openShifts.find((s) => s.shiftId === sheet.shiftId) ?? null : null;

  return (
    <View style={styles.screen}>
      {header}
      {body}
      {sheet?.kind === "closeAnyway" && readiness && dayKey ? (
        <NoteSheet
          title={`${closeTitle(dayKey)} anyway?`}
          lines={readiness.skipped.map((line) => `Not done: ${line}`)}
          noteLabel="Why close now"
          placeholder="Maria is off today; she accepts in the morning"
          isNoteRequired={readiness.needsForce}
          confirmLabel={`${closeTitle(dayKey)} anyway`}
          isOffline={isOffline}
          onConfirm={(typed) => runClose(closeNoteOf(typed, readiness.skipped), readiness.needsForce)}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === "reopen" && record ? (
        <NoteSheet
          title="Reopen this day?"
          lines={["Its shifts stay ended. Closing it again saves a new version and keeps this one."]}
          noteLabel="Why reopen"
          placeholder="A GCash payment was missed"
          isNoteRequired
          confirmLabel="Reopen"
          tone="danger"
          isOffline={isOffline}
          onConfirm={async (reason) => {
            try {
              await reopenBusinessDay(liveCashDb, record.id, reason);
              await refresh();
              setSheet(null);
              return { ok: true };
            } catch (error) {
              return failure(error, "The day could not be reopened.");
            }
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === "deposit" && record ? (
        <DepositSheet
          cashToDepositCents={record.snapshot?.cashToAccountForCents ?? 0}
          isOffline={isOffline}
          onPickPhoto={pickAndUploadDepositPhoto}
          onSave={async (deposit, proofUrl) => {
            try {
              await recordDayDeposit(liveCashDb, record.id, { cents: deposit.cents, to: deposit.to, ref: deposit.ref, proofUrl });
              await refresh();
              setSheet(null);
              return { ok: true };
            } catch (error) {
              return failure(error, "The deposit could not be recorded.");
            }
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {openShift ? (
        <ForceCloseShiftSheet
          shift={{ id: openShift.shiftId, staffName: openShift.staffName, drawerName: openShift.drawerName, openedAt: openShift.openedAt }}
          isOffline={isOffline}
          nowMs={Date.now()}
          onDone={() => {
            setSheet(null);
            void refresh();
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden" },
  note: { ...typography.caption, color: colors.textMuted },
  closedLine: { ...typography.body, fontWeight: "700", color: colors.success },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  actions: { gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
});

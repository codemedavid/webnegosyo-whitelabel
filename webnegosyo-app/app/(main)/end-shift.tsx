import React, { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { StepBar } from "../../components/cash/StepBar";
import { initialNonCashAnswers, isNonCashComplete, toCloseNonCash } from "../../components/cash/non-cash";
import { isRemitReady, remitCloseArgs, type RemitHow, type RemitTarget } from "../../components/cash/remit-target";
import { CountStep, NonCashStep, RemitStep, ResultStep } from "../../components/end-shift/EndShiftSteps";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { formatPeso } from "../../lib/expenses/keypad";
import { pendingDrawerCents } from "../../lib/expenses/expense-queue";
import { useDeviceExpenseQueue } from "../../lib/expenses/use-expenses";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { usePendingSaleCounts } from "../../lib/offline/use-outbox-sync";
import { isTabletScreen } from "../../lib/screen-size";
import { formatClock, formatDayLabel } from "../../lib/staff-format";
import { readStaffName } from "../../lib/shift-service";
import { remittanceHref } from "../../lib/cash-routes";
import { toRemitReceivers } from "../../lib/cash/receivers";
import { useCashReceivers, useCashSettings } from "../../lib/cash/use-cash-rules";
import { closeShiftRpc, countShift, type ShiftClosePreview } from "../../lib/cash/shift-close";
import { useClosePreview, useEndShiftDraft } from "../../lib/cash/shift-end-hooks";
import { useShiftDetail } from "../../lib/cash/shift-sales-hooks";
import {
  canLeaveResult,
  canRecount,
  canRemit,
  canSubmitCount,
  countedCentsOf,
  END_SHIFT_COPY,
  END_SHIFT_STEPS,
  floatToKeep,
  handoverCents,
  isCountLocked,
  nextStep,
  previousStep,
  startRecount,
  stepsFor,
  withCount,
  type EndShiftStep,
} from "../../lib/cash/shift-end-flow";
import { DEFAULT_CASH_SETTINGS } from "../../lib/cash/settings";
import { colors, spacing, typography } from "../../theme/colors";

const DRAWER_ROUTE = "/(main)/pos-sales";

/**
 * End shift & remit (06 §4.3): count cash, then GCash & cards, then result, then remit,
 * then the remittance slip replaces the flow. The server keeps every count
 * and reveals the expected figure only after one (blind or not), so the
 * cashier counts first and is told after. The count is saved on this tablet
 * as it is typed; leaving keeps it.
 */
export default function EndShiftScreen() {
  const { shift: shiftParam } = useLocalSearchParams<{ shift?: string }>();
  const shiftId = typeof shiftParam === "string" && shiftParam ? shiftParam : null;
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const isDemo = useAuthStore((s) => s.isDemo);

  const shiftRead = useShiftDetail(isDemo ? null : shiftId);
  const preview = useClosePreview(isDemo ? null : shiftId);
  const { draft, update, clear } = useEndShiftDraft(isDemo ? null : tenantId, shiftId, "bills");

  if (isDemo) return <Blocked title="Demo store" message={DEMO_READONLY_MESSAGE} />;
  if (!shiftId) return <Blocked title="No shift chosen" message="Open End shift from the Drawer." />;
  if (shiftRead.isLoading || preview.isLoading || !draft) return <LoadingScreen />;
  if (shiftRead.error) return <Failed message={shiftRead.error} onRetry={() => void shiftRead.refetch()} />;
  const shift = shiftRead.data;
  if (!shift) return <Blocked title="Shift not found" message="This shift isn't here. It may belong to a branch this account can't see." />;
  if (shift.status !== "open") return <Blocked title="This shift has ended" message="Its slip is in Remittances." />;
  const answer = preview.data;
  if (!answer) return <Failed message={preview.error ?? END_SHIFT_COPY.offlineCount} onRetry={() => void preview.refetch()} />;
  // Offline or unreachable: the count can still be typed and saved; the
  // server is asked again before anything is sent.
  if (!answer.ok && answer.kind !== "failed") return <Blocked title="Can't end this shift here" message={answer.message} />;
  return (
    <EndShiftFlow
      key={shift.id}
      shift={shift}
      preview={answer.ok ? answer.data : null}
      previewNotice={answer.ok ? null : answer.message}
      draft={draft}
      update={update}
      clearDraft={clear}
      refetchPreview={preview.refetch}
    />
  );
}

type Shift = NonNullable<ReturnType<typeof useShiftDetail>["data"]>;
type DraftApi = ReturnType<typeof useEndShiftDraft>;

interface FlowProps {
  shift: Shift;
  /** Null = not reachable right now (offline): counting still works, sending waits. */
  preview: ShiftClosePreview | null;
  previewNotice: string | null;
  draft: NonNullable<DraftApi["draft"]>;
  update: DraftApi["update"];
  clearDraft: DraftApi["clear"];
  refetchPreview: () => Promise<void>;
}

function EndShiftFlow({ shift, preview, previewNotice, draft, update, clearDraft, refetchPreview }: FlowProps) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const isTablet = isTabletScreen(useWindowDimensions());
  const isOffline = useConnectivity().status === "offline";
  const pendingSales = usePendingSaleCounts();
  const expenseQueue = useDeviceExpenseQueue();
  const settings = useCashSettings(tenantId).data ?? DEFAULT_CASH_SETTINGS;
  const receiversRead = useCashReceivers(tenantId, shift.outletId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<RemitTarget | null>(null);
  const [how, setHow] = useState<RemitHow>("phone");

  const methods = preview?.nonCashByMethod ?? null;
  const steps = useMemo(() => stepsFor(methods), [methods]);
  const step: EndShiftStep = steps.includes(draft.step) ? draft.step : "count";
  const nonCash = draft.nonCash ?? initialNonCashAnswers(methods ?? []);
  const count = draft.count;
  const counted = countedCentsOf(draft);
  const floatKept = floatToKeep({
    openingFloatCents: preview?.floatCents ?? Math.round(shift.openingFloat * 100),
    isZeroBalance: preview?.isZeroBalance ?? shift.isZeroBalance,
    countedCents: count?.countedCents ?? counted ?? 0,
    chosenCents: draft.floatKeptCents,
  });
  const handover = handoverCents(count?.countedCents ?? 0, floatKept);
  const receivers = useMemo(
    () => (receiversRead.data ? toRemitReceivers(receiversRead.data, userId, Date.now()) : null),
    [receiversRead.data, userId],
  );
  const isRemitOff = settings.remittanceMode === "off";

  const goTo = (next: EndShiftStep | null) => {
    if (!next) return;
    setError(null);
    update((d) => ({ ...d, step: next }));
  };

  const submitCount = async () => {
    if (isCountLocked(draft)) return goTo(nextStep(steps, "count"));
    const gate = canSubmitCount({
      isOffline,
      pendingSales: pendingSales.pending,
      waitingExpenses: pendingDrawerCents(expenseQueue.expenses, shift.id).count,
      countedCents: counted,
    });
    if (!gate.ok) return setError(gate.reason);
    setBusy(true);
    const result = await countShift({
      shiftId: shift.id,
      countedCents: counted as number,
      denominations: draft.mode === "bills" ? draft.counts : null,
      deviceExpectedCents: null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    update((d) => ({ ...withCount(d, result.data), step: nextStep(steps, "count") ?? "result" }));
    setError(null);
    void refetchPreview();
  };

  const remit = async () => {
    const gate = canRemit({ isOffline, isTargetReady: isRemitReady(target, how, receivers, isOffline), remittanceMode: settings.remittanceMode });
    if (!gate.ok) return setError(gate.reason);
    const receiver = isRemitOff ? null : remitCloseArgs(target);
    setBusy(true);
    const result = await closeShiftRpc({
      shiftId: shift.id,
      nonCash: toCloseNonCash(nonCash),
      varianceReason: draft.reasonKey,
      note: draft.note.trim() || null,
      floatKeptCents: floatKept,
      remitTo: receiver?.remitTo ?? null,
      remitToSafe: receiver?.remitToSafe ?? false,
      closedByName: await readStaffName(),
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    await clearDraft();
    const { remittanceId } = result.data;
    if (!remittanceId) {
      Alert.alert("Shift ended", `Hand over ${formatPeso(result.data.handedOverCents)}.`);
      router.replace(DRAWER_ROUTE as never);
      return;
    }
    // PIN here now: the slip asks the receiver for their PIN on this tablet.
    const pinFor = !isRemitOff && how === "pin" && target?.kind === "person" ? `&pin=${encodeURIComponent(target.userId)}` : "";
    router.replace(`${remittanceHref(remittanceId)}${pinFor}` as never);
  };

  const onNext = () => {
    if (busy) return;
    if (step === "count") return void submitCount();
    if (step === "noncash") {
      if (!isNonCashComplete(nonCash)) return setError("Answer each one, or tap “I'll leave this to the owner”.");
      return goTo(nextStep(steps, step));
    }
    if (step === "result") {
      const gate = canLeaveResult(count, draft.reasonKey);
      return gate.ok ? goTo(nextStep(steps, step)) : setError(gate.reason);
    }
    void remit();
  };

  const onBack = () => {
    const previous = previousStep(steps, step);
    if (previous) return goTo(previous);
    Alert.alert(END_SHIFT_COPY.leaveTitle, END_SHIFT_COPY.leaveMessage, [
      { text: "Keep counting", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const nextLabel =
    step === "count"
      ? isCountLocked(draft)
        ? "Next"
        : `Next: ${END_SHIFT_STEPS.find((s) => s.key === nextStep(steps, "count"))?.label ?? "Result"}`
      : step === "noncash"
        ? "Next: Result"
        : step === "result"
          ? `Next: Remit ${formatPeso(handover)}`
          : isRemitOff
            ? "End shift"
            : `Remit ${formatPeso(handover)} & end shift`;

  const businessDay = shift.businessDay ? ` · counts toward ${formatDayLabel(shift.businessDay, new Date().toISOString())}` : "";
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <BackHeader
        title={`End shift · ${shift.drawerName ?? "My drawer"}`}
        subtitle={`${shift.staffName} · ${formatClock(shift.openedAt)} – now${businessDay}`}
        onBack={onBack}
      />
      <View style={styles.bar}>
        <StepBar
          steps={END_SHIFT_STEPS}
          currentIndex={END_SHIFT_STEPS.findIndex((s) => s.key === step)}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {previewNotice ? <Text style={styles.notice}>{previewNotice}</Text> : null}
        {step === "count" ? (
          isCountLocked(draft) && count ? (
            <View style={styles.locked} testID="end-shift-locked">
              <Text style={styles.lockedTitle}>{`Counted ${formatPeso(count.countedCents)}`}</Text>
              <Text style={styles.hint}>
                {canRecount(draft) ? "Your count is in. If it was wrong, Recount on the Result step." : "Your recount is in."}
              </Text>
            </View>
          ) : (
            <CountStep draft={draft} preview={preview} onChange={update} isTablet={isTablet} onDone={onNext} />
          )
        ) : null}
        {step === "noncash" ? <NonCashStep answers={nonCash} onChange={(answers) => update((d) => ({ ...d, nonCash: answers }))} /> : null}
        {step === "result" && count ? (
          <ResultStep
            count={count}
            onRecount={canRecount(draft) ? () => update(startRecount) : undefined}
            reasonKey={draft.reasonKey}
            note={draft.note}
            onReason={(reasonKey) => update((d) => ({ ...d, reasonKey }))}
            onNote={(note) => update((d) => ({ ...d, note }))}
            reasonError={error === END_SHIFT_COPY.pickReason ? error : null}
            thresholdCents={settings.varianceReasonFromCents}
            isZeroBalance={preview?.isZeroBalance ?? shift.isZeroBalance}
            floatKeptCents={floatKept}
            handoverCents={handover}
            onFloatKept={(cents) => update((d) => ({ ...d, floatKeptCents: cents }))}
          />
        ) : null}
        {step === "remit" ? (
          <RemitStep
            receivers={receivers}
            receiversError={receiversRead.error}
            target={target}
            onTarget={setTarget}
            how={how}
            onHow={setHow}
            isOffline={isOffline}
            handoverCents={handover}
            isRemitOff={isRemitOff}
          />
        ) : null}
        {error && error !== END_SHIFT_COPY.pickReason ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={nextLabel} size="lg" onPress={onNext} isLoading={busy} testID="end-shift-next" />
      </View>
    </KeyboardAvoidingView>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.screen}>
      <BackHeader title="End shift" />
      <LoadingState message="Getting your drawer ready…" />
    </View>
  );
}

function Blocked({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.screen}>
      <BackHeader title="End shift" />
      <EmptyState icon="info" title={title} message={message} inset />
      <View style={styles.footer}>
        <Button label="Back to the Drawer" tone="secondary" size="lg" onPress={() => router.replace(DRAWER_ROUTE as never)} />
      </View>
    </View>
  );
}

function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.screen}>
      <BackHeader title="End shift" />
      <ErrorState title="Couldn't get your drawer" message={message} onRetry={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bar: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  body: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  footer: { padding: spacing.xl, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, backgroundColor: colors.background },
  error: { ...typography.body, color: colors.danger, fontWeight: "600" },
  hint: { ...typography.caption, color: colors.textMuted },
  notice: { ...typography.caption, fontWeight: "600", color: colors.statusPending.text, backgroundColor: colors.warningLight, padding: spacing.md, borderRadius: 10 },
  locked: { backgroundColor: colors.card, borderRadius: 16, padding: spacing.lg, gap: spacing.xs, borderWidth: 1, borderColor: colors.separator },
  lockedTitle: { ...typography.title, color: colors.textPrimary, fontVariant: ["tabular-nums"] },
});

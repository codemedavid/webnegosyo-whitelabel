import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useAuthStore } from "../../../stores/auth-store";
import { CustomersAccessGate } from "../../../components/customers/CustomersAccessGate";
import { campaignHref } from "../../../lib/navigation";
import { isSmsCampaignsAvailable } from "../../../lib/sms/availability";
import {
  dateFieldToDate,
  dateToDateField,
  dateToTimeField,
  timeFieldToDate,
} from "../../../lib/sms/date-fields";
import {
  EMPTY_CAMPAIGN_DRAFT,
  describeCampaignCost,
  validateCampaignDraft,
  type CampaignDraft,
} from "../../../lib/sms/campaign-form";
import {
  createCampaign,
  ensureRun,
  listCampaignRows,
  lastRunAtByCampaign,
  setCampaignStatus,
  toScheduledCampaign,
  updateCampaign,
} from "../../../lib/sms/campaigns-repo";
import { canActivate, statusActionsFor, statusLabel } from "../../../lib/sms/campaign-status";
import type { CampaignStatus } from "../../../lib/sms/due-runs";
import { computeCampaignDueStates } from "../../../lib/sms/due-runs";
import { describeCampaignTiming } from "../../../lib/sms/campaign-summary";
import { selectAudience } from "../../../lib/sms/audience";
import { consumesCampaign, decideSendNow, immediateRunAt } from "../../../lib/sms/send-now";
import { listCustomers, listSuppressedPhones } from "../../../lib/sms/customers-repo";
import { toManilaParts } from "../../../lib/sms/schedule";
import {
  CAMPAIGN_PRESETS,
  buildPresetDraft,
  isCampaignPresetId,
} from "../../../lib/sms/campaign-presets";
import {
  AUDIENCE_SEGMENTS,
  addOneDay,
  describeAudience,
  describeDate,
  describeSchedule,
  firstIncompleteStep,
  formatTime12h,
  isStepComplete,
  nextStep,
  previousStep,
  STEP_LABELS,
  type AudienceSegmentId,
  type WizardStep,
} from "../../../lib/sms/campaign-wizard";
import { buildMessagePreview, buildPreviewSegments } from "../../../lib/sms/message-preview";
import { planTestSend } from "../../../lib/sms/test-send";
import { createSmsTransport } from "../../../lib/sms/transport";
import { androidSmsPermissions } from "../../../lib/sms/android-permissions";
import { SmsSenderModule } from "../../../modules/sms-sender";
import { useSmsRun } from "../../../hooks/use-sms-run";
import type { AudienceFilter, SmsCustomer, SmsNativeClient } from "../../../lib/sms/types";
import { colors, typography, spacing, radius, shadow } from "../../../theme/colors";
import { BackHeader } from "../../../components/BackHeader";
import { Button } from "../../../components/Button";
import { Icon } from "../../../components/Icon";
import { LoadingState } from "../../../components/LoadingState";
import { WizardProgress } from "../../../components/sms/campaign/WizardProgress";
import { BLANK_GOAL_ID, GoalStep } from "../../../components/sms/campaign/GoalStep";
import { MessageStep } from "../../../components/sms/campaign/MessageStep";
import { AudienceStep } from "../../../components/sms/campaign/AudienceStep";
import { ScheduleStep, type PickerField } from "../../../components/sms/campaign/ScheduleStep";
import { ReviewStep } from "../../../components/sms/campaign/ReviewStep";

const NEW_CAMPAIGN_ID = "new";
const STEP_FADE_MS = 200;
const STEP_SLIDE_PX = 14;
const STORE_FALLBACK = "our store";

/**
 * Route-level gate.
 *
 * Hiding the entry point on the Customers screen is not enough: this is a real
 * route, still reachable by deep link, a notification tap, or a navigation
 * state restored from a previous Android install. Hook rules forbid an early
 * return inside the editor itself, so the gate is a wrapper around it.
 */
export default function CampaignEditorRoute() {
  if (!isSmsCampaignsAvailable(Platform.OS)) {
    return <Redirect href="/customers" />;
  }

  // A campaign names its recipients: the same grant as the guest list.
  return (
    <CustomersAccessGate title="Campaign">
      <CampaignEditorScreen />
    </CustomersAccessGate>
  );
}

/**
 * A campaign, as a guided flow.
 *
 * New campaigns walk five short steps — goal, message, who, when, review —
 * instead of one fifteen-field form. A saved campaign opens on its review
 * summary with Send pinned underneath, and each step is one tap away from it.
 * Every rule about what may be saved or sent is unchanged; only the order the
 * merchant meets the questions in is new.
 */
function CampaignEditorScreen() {
  const { campaignId, preset, created } = useLocalSearchParams<{
    campaignId: string;
    preset?: string;
    created?: string;
  }>();
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantName = useAuthStore((s) => s.tenantName);
  const storeName = tenantName ?? STORE_FALLBACK;
  const isNew = campaignId === NEW_CAMPAIGN_ID;
  const insets = useSafeAreaInsets();

  const today = toManilaParts(new Date()).date;
  const tomorrow = addOneDay(today);

  // A new campaign opened from the Reports dashboard arrives with its preset
  // already chosen, so "Text them" lands on a ready message, not a blank form.
  const [draft, setDraft] = useState<CampaignDraft>(() =>
    isNew && isCampaignPresetId(preset)
      ? buildPresetDraft(preset, toManilaParts(new Date()).date)
      : EMPTY_CAMPAIGN_DRAFT
  );
  const [goalId, setGoalId] = useState<string | null>(() =>
    isNew && isCampaignPresetId(preset) ? preset : null
  );
  const [step, setStep] = useState<WizardStep>(() => {
    if (!isNew) return "review";
    return isCampaignPresetId(preset) ? "message" : "goal";
  });
  const [savedDraft, setSavedDraft] = useState<CampaignDraft | null>(null);
  const [customers, setCustomers] = useState<SmsCustomer[]>([]);
  const [suppressedPhones, setSuppressedPhones] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [timingLine, setTimingLine] = useState<string | null>(null);
  const [status, setStatus] = useState<CampaignStatus>("draft");
  const [openPicker, setOpenPicker] = useState<PickerField | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testOutcome, setTestOutcome] = useState<string | null>(null);

  const run = useSmsRun();
  const scrollRef = useRef<ScrollView>(null);
  const stepFade = useRef(new Animated.Value(1)).current;
  const [isReduceMotion, setReduceMotion] = useState(false);

  const validation = useMemo(() => validateCampaignDraft(draft, today), [draft, today]);
  const problemStep = firstIncompleteStep(validation);
  const isDirty =
    !isNew && savedDraft !== null && JSON.stringify(draft) !== JSON.stringify(savedDraft);

  const reachFor = useCallback(
    (filter: AudienceFilter) =>
      selectAudience(customers, filter, { now: new Date(), suppressedPhones }),
    [customers, suppressedPhones]
  );

  const audience = useMemo(() => reachFor(draft.audience), [reachFor, draft.audience]);

  // Head-counts for every card the merchant could tap, so each choice shows
  // its consequence before it is made.
  const reachBySegment = useMemo(
    () =>
      Object.fromEntries(
        AUDIENCE_SEGMENTS.map((segment) => [
          segment.id,
          reachFor({ ...segment.filter }).recipients.length,
        ])
      ) as Record<AudienceSegmentId, number>,
    [reachFor]
  );
  const reachByPreset = useMemo(
    () =>
      Object.fromEntries(
        CAMPAIGN_PRESETS.map((candidate) => [
          candidate.id,
          reachFor(buildPresetDraft(candidate.id, today).audience).recipients.length,
        ])
      ),
    [reachFor, today]
  );

  const sendNowDecision = useMemo(
    () =>
      decideSendNow({
        platform: Platform.OS,
        isNew,
        isValid: validation.isValid,
        status,
        isRunning: run.isRunning,
        recipientCount: audience.recipients.length,
        now: new Date(),
        quietHoursStart: draft.quietHoursStart,
        quietHoursEnd: draft.quietHoursEnd,
      }),
    [
      isNew,
      validation.isValid,
      status,
      run.isRunning,
      audience.recipients.length,
      draft.quietHoursStart,
      draft.quietHoursEnd,
    ]
  );

  const cost = useMemo(
    () => describeCampaignCost(draft.messageTemplate, audience.recipients.length),
    [draft.messageTemplate, audience.recipients.length]
  );

  /**
   * The sentence a guest will actually receive, filled in with a real
   * recipient's details where there is one. Never throws — see
   * `message-preview.ts`; the merchant is often mid-word.
   */
  const firstRecipient = audience.recipients[0] ?? null;
  const preview = useMemo(
    () => buildMessagePreview(draft.messageTemplate, firstRecipient, storeName),
    [draft.messageTemplate, firstRecipient, storeName]
  );
  const segments = useMemo(
    () => buildPreviewSegments(draft.messageTemplate, firstRecipient, storeName),
    [draft.messageTemplate, firstRecipient, storeName]
  );
  const previewTimestamp =
    draft.scheduleKind === "one_off" && draft.scheduleDate
      ? `${capitalise(describeDate(draft.scheduleDate, today))} · ${formatTime12h(draft.scheduleTime)}`
      : formatTime12h(draft.scheduleTime);

  const sendLabel = `Send now to ${audience.recipients.length} guests`;

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [people, blocked, rows, lastRuns] = await Promise.all([
        listCustomers(tenantId),
        listSuppressedPhones(tenantId),
        isNew ? Promise.resolve([]) : listCampaignRows(tenantId),
        isNew
          ? Promise.resolve({} as Record<string, string>)
          : lastRunAtByCampaign(tenantId),
      ]);
      setCustomers(people);
      setSuppressedPhones(blocked);

      if (!isNew) {
        const row = rows.find((r) => r.id === campaignId);
        if (row) {
          const loaded: CampaignDraft = {
            name: row.name,
            messageTemplate: row.message_template,
            audience: (row.audience as CampaignDraft["audience"]) ?? {},
            scheduleKind: row.schedule_kind as CampaignDraft["scheduleKind"],
            scheduleTime: row.schedule_time,
            scheduleDate: row.schedule_date,
            scheduleIntervalDays: row.schedule_interval_days,
            scheduleWeekdays: row.schedule_weekdays ?? [],
            quietHoursStart: row.quiet_hours_start,
            quietHoursEnd: row.quiet_hours_end,
            maxPerRun: row.max_per_run,
          };
          setDraft(loaded);
          setSavedDraft(loaded);

          const scheduled = toScheduledCampaign(row, lastRuns[row.id] ?? null);
          setStatus(scheduled.status);
          // The run row is opened when the merchant sends, not when they merely
          // open the screen — reading a campaign should not write one.
          const [state] = computeCampaignDueStates([scheduled], new Date());
          setDueAt(state.isDue ? state.dueAt : null);
          setTimingLine(describeCampaignTiming(state).line);
        }
      }
    } catch (error) {
      Alert.alert("Could not load", error instanceof Error ? error.message : "Try again.");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, campaignId, isNew]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);

  // Each step arrives at the top of the page with a short settle, so moving
  // on reads as a new question rather than the same form scrolled.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (isReduceMotion) return;
    stepFade.setValue(0);
    Animated.timing(stepFade, {
      toValue: 1,
      duration: STEP_FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step, stepFade, isReduceMotion]);

  const patch = (changes: Partial<CampaignDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  /** Where Back goes: the previous question, the summary, or out. */
  const backTarget = (): WizardStep | null => {
    if (isNew) return previousStep(step);
    return step === "review" ? null : "review";
  };

  const leave = () => {
    if (!isDirty) {
      router.back();
      return;
    }
    Alert.alert("Leave without saving?", "Your changes to this campaign will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const goBack = () => {
    const target = backTarget();
    if (target) setStep(target);
    else leave();
  };

  // Android's back button walks the steps too, instead of throwing away a
  // half-written campaign.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const target = backTarget();
      if (target) {
        setStep(target);
        return true;
      }
      if (!isDirty) return false;
      leave();
      return true;
    });
    return () => subscription.remove();
  });

  const draftForGoal = (id: string): CampaignDraft =>
    id === BLANK_GOAL_ID
      ? { ...EMPTY_CAMPAIGN_DRAFT, scheduleDate: today }
      : buildPresetDraft(id, today);

  /**
   * Choosing a goal fills in the whole campaign and moves on. Choosing a
   * DIFFERENT goal after editing the words asks first — a tap should never
   * silently throw away something the merchant typed.
   */
  const pickGoal = (id: string) => {
    if (id === goalId) {
      setStep("message");
      return;
    }
    const apply = () => {
      setDraft(draftForGoal(id));
      setGoalId(id);
      setStep("message");
    };
    const hasEditedWords =
      goalId !== null && draft.messageTemplate !== draftForGoal(goalId).messageTemplate;
    if (!hasEditedWords) {
      apply();
      return;
    }
    Alert.alert("Replace your message?", "Picking a new goal swaps in its own message.", [
      { text: "Keep mine", style: "cancel" },
      { text: "Replace", style: "destructive", onPress: apply },
    ]);
  };

  /**
   * Apply whatever the calendar or clock came back with.
   *
   * The draft still stores `YYYY-MM-DD` and `HH:MM` — `date-fields.ts` does the
   * conversion, and does it off the local clock rather than UTC, which is what
   * keeps a Manila evening from being filed under yesterday.
   */
  const applyPicked = (event: DateTimePickerEvent, picked?: Date) => {
    const field = openPicker;
    // Android shows this as a dialog; closing it first keeps a re-tap working
    // even when the merchant dismisses without choosing.
    setOpenPicker(null);
    if (event.type === "dismissed" || !picked || !field) return;

    if (field === "date") patch({ scheduleDate: dateToDateField(picked) });
    else if (field === "time") patch({ scheduleTime: dateToTimeField(picked) });
    else if (field === "quietStart") patch({ quietHoursStart: dateToTimeField(picked) });
    else patch({ quietHoursEnd: dateToTimeField(picked) });
  };

  /**
   * Save, and stay on the campaign that was just saved.
   *
   * Going back to the list after a save is what made "Send now is not
   * available" true: the whole Send action is gated on the campaign having an
   * id. Replacing the route with the real id lands the merchant on the saved
   * campaign's summary, with Send right there in the bar.
   */
  const save = async () => {
    if (!tenantId || !validation.isValid) return;
    setIsSaving(true);
    try {
      if (isNew) {
        const newId = await createCampaign(tenantId, draft);
        // replace, not push: going back should return to the list, not to an
        // empty create form that would save a second copy.
        router.replace(`${campaignHref(newId)}?created=1`);
        return;
      }
      await updateCampaign(String(campaignId), draft);
      await load();
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const changeStatus = async (next: CampaignStatus) => {
    if (next === "active" && !canActivate(status, validation.isValid)) {
      Alert.alert(
        "Fix the campaign first",
        "A campaign with errors cannot go live — it would sit on a schedule it can never satisfy."
      );
      return;
    }
    const previous = status;
    setStatus(next);
    try {
      await setCampaignStatus(String(campaignId), next);
      await load();
    } catch (error) {
      setStatus(previous);
      Alert.alert("Could not change", error instanceof Error ? error.message : "Try again.");
    }
  };

  /**
   * Text this message to one number, now.
   *
   * Deliberately independent of `dueRunId`: the whole point is to try the
   * message — and find out whether this handset can send at all — before a
   * campaign is ever scheduled or activated. Nothing is written to `sms_sends`;
   * a rehearsal row there would make a resumed run skip a real guest.
   */
  const sendTest = async () => {
    const planned = planTestSend({
      phone: testPhone,
      template: draft.messageTemplate,
      storeName,
    });

    if (!planned.ok) {
      setTestOutcome(planned.error);
      return;
    }

    setIsTesting(true);
    setTestOutcome(null);
    try {
      // Lazy, like the run hook: constructing the native module at render is
      // what caused a post-login crash on iOS once already.
      const transport = createSmsTransport({
        platform: Platform.OS,
        native: SmsSenderModule as SmsNativeClient | null,
        permissions: androidSmsPermissions,
      });

      await transport.send(planned.plan.phoneE164, planned.plan.body);
      setTestOutcome(
        `Sent to ${planned.plan.phoneE164}. If it does not arrive in a minute, ` +
          "check your SIM has load and signal."
      );
    } catch (error) {
      setTestOutcome(
        error instanceof Error ? error.message : "The test message could not be sent."
      );
    } finally {
      setIsTesting(false);
    }
  };

  /**
   * Send this campaign, now, without waiting for its schedule.
   *
   * Deliberately not gated on `dueRunId` — that is the limitation this exists
   * to remove. When the campaign IS due the scheduled occurrence is used, so
   * the run is filed against the moment the schedule promised; otherwise a
   * fresh run is opened at a minute-quantized "now", which is what keeps a
   * double-tap to one run row.
   */
  const sendNow = async () => {
    if (!tenantId || !sendNowDecision.canSend) return;

    const runAt = dueAt ?? immediateRunAt(new Date());
    const isConsumed = consumesCampaign(draft.scheduleKind);

    Alert.alert(
      "Send this campaign?",
      `${audience.recipients.length} guests will get a text from this phone's SIM, ` +
        `costing about ${cost.totalSegments} SMS.` +
        (isConsumed ? " This one-off campaign will be archived afterwards." : "") +
        // Quiet hours no longer block a manual send; they are said out loud
        // here instead, so a late-night blast is a choice not an accident.
        (sendNowDecision.warning ? `\n\n${sendNowDecision.warning}` : ""),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          style: "destructive",
          onPress: async () => {
            try {
              const runId = await ensureRun(tenantId, String(campaignId), runAt);
              if (!runId) {
                Alert.alert("Could not start", "That run could not be opened. Try again.");
                return;
              }
              await run.start({
                tenantId,
                runId,
                template: draft.messageTemplate,
                storeName,
                maxPerRun: draft.maxPerRun,
                audience: audience.recipients,
              });
              // A one-off's own scheduled date is still ahead of `lastRunAt`
              // (which is completed_at), so leaving it active would text the
              // same guests a second time when that date arrives.
              if (isConsumed) {
                await setCampaignStatus(String(campaignId), "archived");
                setStatus("archived");
              }
              await load();
            } catch (error) {
              Alert.alert(
                "Could not send",
                error instanceof Error ? error.message : "Try again."
              );
            }
          },
        },
      ]
    );
  };

  if (isLoading) return <LoadingState message="Loading campaign…" />;

  const previewProps = {
    preview,
    segments,
    cost,
    recipientCount: audience.recipients.length,
    recipientName: firstRecipient?.name?.trim() ?? null,
    storeName,
    timestamp: previewTimestamp,
  };
  const canGoOn = isStepComplete(step, validation);
  const nextLabel = `Next: ${STEP_LABELS[nextStep(step)]}`;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <BackHeader
        title={isNew ? "New campaign" : "Campaign"}
        subtitle={isNew ? "Text your guests" : undefined}
        onBack={goBack}
      />
      {isNew && <WizardProgress step={step} />}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={{
            opacity: stepFade,
            transform: [
              {
                translateY: stepFade.interpolate({
                  inputRange: [0, 1],
                  outputRange: [STEP_SLIDE_PX, 0],
                }),
              },
            ],
          }}
        >
          {step === "goal" && (
            <GoalStep
              presets={CAMPAIGN_PRESETS}
              reachById={reachByPreset}
              selectedId={goalId}
              onPick={pickGoal}
            />
          )}
          {step === "message" && (
            <MessageStep
              name={draft.name}
              messageTemplate={draft.messageTemplate}
              nameError={validation.errors.name}
              messageError={validation.errors.messageTemplate}
              cost={cost}
              preview={previewProps}
              onChangeName={(name) => patch({ name })}
              onChangeMessage={(messageTemplate) => patch({ messageTemplate })}
            />
          )}
          {step === "audience" && (
            <AudienceStep
              filter={draft.audience}
              onChange={(filter) => patch({ audience: filter })}
              reachBySegment={reachBySegment}
              matchedCount={audience.recipients.length}
              totalGuests={customers.length}
              excludedSummary={audience.summary}
              onRecordConsent={() => router.push("/(main)/customers")}
            />
          )}
          {step === "schedule" && (
            <ScheduleStep
              draft={draft}
              errors={validation.errors}
              today={today}
              tomorrow={tomorrow}
              onPatch={patch}
              onOpenPicker={setOpenPicker}
            />
          )}
          {step === "review" && (
            <ReviewStep
              isNew={isNew}
              name={draft.name}
              preview={previewProps}
              audienceLine={describeAudience(draft.audience)}
              recipientCount={audience.recipients.length}
              scheduleLine={describeSchedule(draft, today)}
              problemStep={problemStep}
              onEdit={setStep}
              status={
                isNew
                  ? undefined
                  : {
                      value: status,
                      label: statusLabel(status),
                      nextLine: timingLine,
                      actions: statusActionsFor(status),
                      onChange: changeStatus,
                    }
              }
              isJustCreated={created === "1" && status === "active" && !run.result}
              testSend={{
                isAvailable: Platform.OS === "android",
                phone: testPhone,
                onChangePhone: setTestPhone,
                onSend: sendTest,
                isSending: isTesting,
                outcome: testOutcome,
              }}
              runResult={run.result}
              runError={run.error}
            />
          )}
        </Animated.View>
      </ScrollView>

      {/*
        Pinned, not scrolled. Both of the merchant's original reports — "it
        does not let me send manually" and "the send now button is not
        available" — were reachability, not logic. The step's one action, and
        on a saved campaign the Send button, cannot be scrolled away from.
      */}
      {step !== "goal" && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.md }]}>
          {run.isRunning && run.progress ? (
            <View style={styles.progressRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.progressText}>
                Sending {run.progress.attempted} of {run.progress.total}…
              </Text>
              <TouchableOpacity onPress={run.cancel} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.cancelText}>Stop</Text>
              </TouchableOpacity>
            </View>
          ) : step !== "review" ? (
            isNew ? (
              <View style={styles.buttonRow}>
                <Button label="Back" tone="secondary" size="lg" fullWidth={false} onPress={goBack} />
                <Button
                  label={nextLabel}
                  size="lg"
                  icon="arrow-right"
                  disabled={!canGoOn}
                  onPress={() => setStep(nextStep(step))}
                  style={styles.grow}
                />
              </View>
            ) : (
              <Button label="Back to summary" size="lg" onPress={() => setStep("review")} />
            )
          ) : isNew ? (
            <>
              <Text style={styles.barHint}>
                {validation.isValid
                  ? "Saved as active. Nothing is sent until you tap Send."
                  : "Fix the highlighted step to save this campaign."}
              </Text>
              <Button
                label={isSaving ? "Saving…" : "Create campaign"}
                size="lg"
                icon="check"
                disabled={!validation.isValid}
                isLoading={isSaving}
                onPress={save}
              />
            </>
          ) : isDirty ? (
            <View style={styles.buttonRow}>
              <Button
                label="Discard"
                tone="secondary"
                size="lg"
                fullWidth={false}
                onPress={() => savedDraft && setDraft(savedDraft)}
              />
              <Button
                label={isSaving ? "Saving…" : "Save changes"}
                size="lg"
                disabled={!validation.isValid}
                isLoading={isSaving}
                onPress={save}
                style={styles.grow}
              />
            </View>
          ) : (
            <>
              {!sendNowDecision.canSend && (
                <View style={styles.notice}>
                  <Icon name="info" size={16} color={colors.textPrimary} />
                  <View style={styles.noticeCopy}>
                    <Text style={styles.noticeText}>{sendNowDecision.message}</Text>
                    {sendNowDecision.block === "no_audience" && (
                      <TouchableOpacity
                        onPress={() => router.push("/(main)/customers")}
                        accessibilityRole="button"
                        style={styles.noticeLink}
                      >
                        <Text style={styles.linkText}>Record who agreed to texts</Text>
                        <Icon name="arrow-right" size={13} color={colors.textPrimary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
              <Button
                label={sendLabel}
                size="lg"
                icon="send"
                disabled={!sendNowDecision.canSend}
                onPress={sendNow}
              />
            </>
          )}
        </View>
      )}

      {openPicker === "date" && (
        <DateTimePicker
          mode="date"
          minimumDate={dateFieldToDate(today, new Date())}
          value={dateFieldToDate(draft.scheduleDate, new Date())}
          onChange={applyPicked}
        />
      )}
      {openPicker !== null && openPicker !== "date" && (
        <DateTimePicker
          mode="time"
          value={timeFieldToDate(
            openPicker === "time"
              ? draft.scheduleTime
              : openPicker === "quietStart"
                ? draft.quietHoursStart
                : draft.quietHoursEnd
          )}
          onChange={applyPicked}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl * 2 },

  // The bar sits on its own surface with a hairline above it, so it reads as
  // furniture rather than as the next thing in the scroll.
  actionBar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    ...shadow.md,
  },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  grow: { flex: 1 },
  barHint: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  notice: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeCopy: { flex: 1, gap: 4 },
  noticeText: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
  noticeLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkText: { ...typography.caption, color: colors.textPrimary, fontWeight: "800" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52 },
  progressText: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  cancelText: { ...typography.body, color: colors.danger, fontWeight: "800" },
});

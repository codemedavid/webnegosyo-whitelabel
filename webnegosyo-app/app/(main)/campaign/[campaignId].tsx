import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useAuthStore } from "../../../stores/auth-store";
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
import {
  canActivate,
  statusActionsFor,
  statusLabel,
} from "../../../lib/sms/campaign-status";
import type { CampaignStatus } from "../../../lib/sms/due-runs";
import { computeCampaignDueStates } from "../../../lib/sms/due-runs";
import { selectAudience } from "../../../lib/sms/audience";
import {
  consumesCampaign,
  decideSendNow,
  immediateRunAt,
} from "../../../lib/sms/send-now";
import { listCustomers, listSuppressedPhones } from "../../../lib/sms/customers-repo";
import { toManilaParts } from "../../../lib/sms/schedule";
import {
  CAMPAIGN_PRESETS,
  buildPresetDraft,
} from "../../../lib/sms/campaign-presets";
import { planTestSend } from "../../../lib/sms/test-send";
import { createSmsTransport } from "../../../lib/sms/transport";
import { androidSmsPermissions } from "../../../lib/sms/android-permissions";
import { SmsSenderModule } from "../../../modules/sms-sender";
import { useSmsRun } from "../../../hooks/use-sms-run";
import type { SmsCustomer, SmsNativeClient, ScheduleKind } from "../../../lib/sms/types";
import { colors, typography, spacing, radius } from "../../../theme/colors";
import { LoadingState } from "../../../components/LoadingState";

const NEW_CAMPAIGN_ID = "new";

const SCHEDULE_LABELS: { kind: ScheduleKind; label: string }[] = [
  { kind: "one_off", label: "Once" },
  { kind: "every_n_days", label: "Every N days" },
  { kind: "weekly", label: "Weekly" },
];

const WEEKDAYS = [
  { iso: 1, label: "M" },
  { iso: 2, label: "T" },
  { iso: 3, label: "W" },
  { iso: 4, label: "T" },
  { iso: 5, label: "F" },
  { iso: 6, label: "S" },
  { iso: 7, label: "S" },
];

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

  return <CampaignEditorScreen />;
}

function CampaignEditorScreen() {
  const { campaignId } = useLocalSearchParams<{ campaignId: string }>();
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantName = useAuthStore((s) => s.tenantName);
  const isNew = campaignId === NEW_CAMPAIGN_ID;

  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_CAMPAIGN_DRAFT);
  const [customers, setCustomers] = useState<SmsCustomer[]>([]);
  const [suppressedPhones, setSuppressedPhones] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<CampaignStatus>("draft");
  const [openPicker, setOpenPicker] = useState<PickerField | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testOutcome, setTestOutcome] = useState<string | null>(null);

  const run = useSmsRun();

  const today = toManilaParts(new Date()).date;
  const validation = useMemo(() => validateCampaignDraft(draft, today), [draft, today]);

  const audience = useMemo(
    () =>
      selectAudience(customers, draft.audience, {
        now: new Date(),
        suppressedPhones,
      }),
    [customers, draft.audience, suppressedPhones]
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
          setDraft({
            name: row.name,
            messageTemplate: row.message_template,
            audience: (row.audience as CampaignDraft["audience"]) ?? {},
            scheduleKind: row.schedule_kind as ScheduleKind,
            scheduleTime: row.schedule_time,
            scheduleDate: row.schedule_date,
            scheduleIntervalDays: row.schedule_interval_days,
            scheduleWeekdays: row.schedule_weekdays ?? [],
            quietHoursStart: row.quiet_hours_start,
            quietHoursEnd: row.quiet_hours_end,
            maxPerRun: row.max_per_run,
          });

          const scheduled = toScheduledCampaign(row, lastRuns[row.id] ?? null);
          setStatus(scheduled.status);
          // The run row is opened when the merchant sends, not when they merely
          // open the screen — reading a campaign should not write one.
          const [state] = computeCampaignDueStates([scheduled], new Date());
          setDueAt(state.isDue ? state.dueAt : null);
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

  const patch = (changes: Partial<CampaignDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

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
   * available" true: the whole Send block is gated on the campaign having an
   * id, so a merchant who created a campaign was returned to a list without
   * ever seeing the button. Replacing the route with the real id puts them on
   * the saved campaign, with Send right there.
   */
  const save = async () => {
    if (!tenantId || !validation.isValid) return;
    setIsSaving(true);
    try {
      if (isNew) {
        const newId = await createCampaign(tenantId, draft);
        // replace, not push: going back should return to the list, not to an
        // empty create form that would save a second copy.
        router.replace(campaignHref(newId));
        return;
      }
      await updateCampaign(String(campaignId), draft);
      setSavedAt(new Date().toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
      }));
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
      storeName: tenantName ?? "our store",
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
                storeName: tenantName ?? "our store",
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{isNew ? "New campaign" : "Edit campaign"}</Text>

      {/*
        A blank draft is not saveable — a one-off with no date fails validation
        the moment this screen opens. A preset is one tap to a campaign that is
        already valid, which is the difference between "write six fields" and
        "check these are right".
      */}
      {isNew && (
        <View style={styles.presetBox}>
          <Text style={styles.label}>Start from a ready-made campaign</Text>
          {CAMPAIGN_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              style={styles.presetCard}
              onPress={() => setDraft(buildPresetDraft(preset.id, today))}
              accessibilityRole="button"
            >
              <Text style={styles.presetTitle}>{preset.title}</Text>
              <Text style={styles.hint}>{preset.description}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.hint}>Or fill in the fields below yourself.</Text>
        </View>
      )}

      <Field label="Campaign name" error={validation.errors.name}>
        <TextInput
          style={styles.input}
          value={draft.name}
          onChangeText={(name) => patch({ name })}
          placeholder="Win back lapsed guests"
          placeholderTextColor={colors.textTertiary}
        />
      </Field>

      <Field label="Message" error={validation.errors.messageTemplate}>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={draft.messageTemplate}
          onChangeText={(messageTemplate) => patch({ messageTemplate })}
          placeholder="Hi {{firstName}}, we miss you at {{storeName}}!"
          placeholderTextColor={colors.textTertiary}
          multiline
        />
        <Text style={styles.hint}>
          Use {"{{firstName}}"}, {"{{storeName}}"}, {"{{orderCount}}"}, {"{{lastOrderDate}}"}
        </Text>
      </Field>

      {/*
        Segment count is shown before sending, not discovered on the phone bill.
        One curly apostrophe flips the whole blast to UCS-2 and more than doubles
        the cost, which is invisible on screen.
      */}
      <View style={styles.costBox}>
        <Text style={styles.costLine}>
          {cost.segmentsPerMessage} SMS per message · {cost.encoding}
        </Text>
        <Text style={styles.costTotal}>
          {audience.recipients.length} recipients → about {cost.totalSegments} SMS
        </Text>
        {cost.encoding === "UCS2" && (
          <Text style={styles.costWarn}>
            A special character made this message cost more. Plain letters are cheaper.
          </Text>
        )}
      </View>

      {/*
        Sending sits here, above the audience and the schedule, because it is
        the action the merchant opened this screen for. It used to be the very
        last thing on a long scroll, under status and quiet hours — which is a
        large part of why "the send now button is not available" was true.
      */}
      {!isNew && (
        <View style={styles.sendBox}>
          <Text style={styles.sectionTitle}>Send</Text>

          <Text style={styles.hint}>
            {dueAt
              ? "This campaign is due now."
              : "You can send this straight away — it does not have to wait for its schedule."}
          </Text>

          {run.isRunning && run.progress ? (
            <View style={styles.progressRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.hint}>
                Sending {run.progress.attempted} of {run.progress.total}…
              </Text>
              <TouchableOpacity onPress={run.cancel}>
                <Text style={styles.cancelText}>Stop</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  !sendNowDecision.canSend && styles.buttonDisabled,
                ]}
                onPress={sendNow}
                disabled={!sendNowDecision.canSend}
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>
                  Send now to {audience.recipients.length} guests
                </Text>
              </TouchableOpacity>
              {/*
                Why the button is dead. This was grey hint text under a greyed
                button, which reads as a broken app rather than an answer — so
                it is a notice now, and the one blocker a merchant can actually
                do something about gets a way through.
              */}
              {!sendNowDecision.canSend && (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>{sendNowDecision.message}</Text>
                  {sendNowDecision.block === "no_audience" && (
                    <TouchableOpacity
                      onPress={() => router.push("/(main)/customers")}
                      accessibilityRole="button"
                    >
                      <Text style={styles.linkText}>
                        Record who agreed to texts →
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          )}

          {run.result && <RunSummary result={run.result} />}
          {run.error && <Text style={styles.errorText}>{run.error}</Text>}
        </View>
      )}

      {/*
        Available on a brand-new, unsaved campaign on purpose. Everything below
        this point — audience, schedule, activation — is guesswork until the
        merchant has seen one of these messages land on a real handset.
      */}
      <View style={styles.testBox}>
        <Text style={styles.label}>Send yourself a test</Text>
        <Text style={styles.hint}>
          One text to your own number, exactly as a guest would receive it. It is not
          counted against the campaign.
        </Text>
        <TextInput
          style={styles.input}
          value={testPhone}
          onChangeText={setTestPhone}
          keyboardType="phone-pad"
          placeholder="0917 123 4567"
          placeholderTextColor={colors.textTertiary}
        />
        {Platform.OS !== "android" ? (
          <Text style={styles.hint}>
            Test sending needs the Android app — it uses that phone&apos;s SIM.
          </Text>
        ) : (
          <TouchableOpacity
            style={[styles.secondaryButton, isTesting && styles.buttonDisabled]}
            onPress={sendTest}
            disabled={isTesting}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>
              {isTesting ? "Sending…" : "Send test message"}
            </Text>
          </TouchableOpacity>
        )}
        {testOutcome && <Text style={styles.hint}>{testOutcome}</Text>}
      </View>

      <Text style={styles.sectionTitle}>Who gets it</Text>
      <Field label="Haven't ordered in (days)">
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={
            draft.audience.lastOrderOlderThanDays === undefined
              ? ""
              : String(draft.audience.lastOrderOlderThanDays)
          }
          onChangeText={(value) =>
            patch({
              audience: {
                ...draft.audience,
                lastOrderOlderThanDays: value === "" ? undefined : Number(value),
              },
            })
          }
          placeholder="Any"
          placeholderTextColor={colors.textTertiary}
        />
      </Field>
      <Field label="At least this many orders">
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={
            draft.audience.minOrderCount === undefined
              ? ""
              : String(draft.audience.minOrderCount)
          }
          onChangeText={(value) =>
            patch({
              audience: {
                ...draft.audience,
                minOrderCount: value === "" ? undefined : Number(value),
              },
            })
          }
          placeholder="Any"
          placeholderTextColor={colors.textTertiary}
        />
      </Field>

      {audience.recipients.length === 0 && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Nobody matches yet. {audience.summary.no_consent} guests have not agreed to SMS
            updates, {audience.summary.no_phone} have no number on file.
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>When</Text>
      <View style={styles.chipRow}>
        {SCHEDULE_LABELS.map(({ kind, label }) => (
          <Chip
            key={kind}
            label={label}
            isActive={draft.scheduleKind === kind}
            onPress={() => patch({ scheduleKind: kind })}
          />
        ))}
      </View>

      {draft.scheduleKind === "one_off" && (
        <Field label="Date" error={validation.errors.scheduleDate}>
          <PickerRow
            value={draft.scheduleDate}
            placeholder="Pick a date"
            onPress={() => setOpenPicker("date")}
          />
        </Field>
      )}

      {draft.scheduleKind === "every_n_days" && (
        <Field label="Repeat every (days)" error={validation.errors.scheduleIntervalDays}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={
              draft.scheduleIntervalDays === null ? "" : String(draft.scheduleIntervalDays)
            }
            onChangeText={(value) =>
              patch({ scheduleIntervalDays: value === "" ? null : Number(value) })
            }
            placeholder="14"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>
      )}

      {draft.scheduleKind === "weekly" && (
        <Field label="Days" error={validation.errors.scheduleWeekdays}>
          <View style={styles.chipRow}>
            {WEEKDAYS.map(({ iso, label }) => (
              <Chip
                key={iso}
                label={label}
                isActive={draft.scheduleWeekdays.includes(iso)}
                onPress={() =>
                  patch({
                    scheduleWeekdays: draft.scheduleWeekdays.includes(iso)
                      ? draft.scheduleWeekdays.filter((d) => d !== iso)
                      : [...draft.scheduleWeekdays, iso].sort(),
                  })
                }
              />
            ))}
          </View>
        </Field>
      )}

      <Field label="Send at" error={validation.errors.scheduleTime}>
        <PickerRow
          value={draft.scheduleTime}
          placeholder="Pick a time"
          onPress={() => setOpenPicker("time")}
        />
      </Field>

      <Text style={styles.sectionTitle}>Quiet hours</Text>
      <Text style={styles.hint}>
        A SCHEDULED message landing inside these hours waits until morning. Sending by
        hand is still your call — you will be told, not stopped.
      </Text>
      <View style={styles.quietRow}>
        <View style={styles.quietCell}>
        <Field label="From">
          <PickerRow
            value={draft.quietHoursStart}
            placeholder="21:00"
            onPress={() => setOpenPicker("quietStart")}
          />
        </Field>
        </View>
        <View style={styles.quietCell}>
        <Field label="Until">
          <PickerRow
            value={draft.quietHoursEnd}
            placeholder="08:00"
            onPress={() => setOpenPicker("quietEnd")}
          />
        </Field>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, !validation.isValid && styles.buttonDisabled]}
        onPress={save}
        disabled={!validation.isValid || isSaving}
      >
        <Text style={styles.primaryButtonText}>
          {isSaving ? "Saving…" : isNew ? "Create campaign" : "Save changes"}
        </Text>
      </TouchableOpacity>
      {/*
        A save used to be acknowledged only by the screen disappearing, which is
        indistinguishable from a crash. Now it says so, on the screen you are
        still standing on.
      */}
      {savedAt && !isSaving && (
        <Text style={styles.savedText}>Saved at {savedAt}.</Text>
      )}

      {!isNew && (
        <View style={styles.sendBox}>
          <Text style={styles.sectionTitle}>Status</Text>
          <Text style={styles.hint}>
            This campaign is {statusLabel(status)}.
            {status !== "active"
              ? " Only an active campaign becomes due and can send."
              : ""}
          </Text>
          <View style={styles.chipRow}>
            {statusActionsFor(status).map((action) => (
              <TouchableOpacity
                key={action.next}
                style={[
                  styles.statusButton,
                  action.isDestructive && styles.statusButtonDestructive,
                ]}
                onPress={() => changeStatus(action.next)}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    action.isDestructive && styles.statusButtonTextDestructive,
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {openPicker === "date" && (
        <DateTimePicker
          mode="date"
          value={dateFieldToDate(draft.scheduleDate, new Date())}
          onChange={applyPicked}
        />
      )}
      {openPicker !== null && openPicker !== "date" && (
        <DateTimePicker
          mode="time"
          is24Hour
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
    </ScrollView>
  );
}

function RunSummary({ result }: { result: ReturnType<typeof useSmsRun>["result"] }) {
  if (!result) return null;

  const halted: Record<string, string> = {
    rate_limited:
      "Android paused outgoing texts. The rest are still waiting — try again in about 30 minutes.",
    aborted: "You stopped the run. The rest are still waiting.",
    log_failed:
      "A send could not be recorded, so the run stopped rather than risk texting someone twice.",
  };

  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>
        Sent {result.sentCount}
        {result.failedCount > 0 ? `, ${result.failedCount} failed` : ""}
        {result.remainingCount > 0 ? `, ${result.remainingCount} still waiting` : ""}.
      </Text>
      {result.status === "claimed_elsewhere" && (
        <Text style={styles.noticeText}>
          Another device is already sending this campaign.
        </Text>
      )}
      {result.haltedReason && (
        <Text style={styles.noticeText}>{halted[result.haltedReason]}</Text>
      )}
    </View>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

/** Which of the four date/time fields the open picker is editing. */
type PickerField = "date" | "time" | "quietStart" | "quietEnd";

/**
 * A field that opens a picker instead of asking for a typed string.
 *
 * Looks like the text inputs around it on purpose — the merchant should not
 * have to learn that two of these fields behave differently.
 */
function PickerRow({
  value,
  placeholder,
  onPress,
}: {
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.input} onPress={onPress} accessibilityRole="button">
      <Text style={value ? styles.pickerValue : styles.pickerPlaceholder}>
        {value || placeholder}
      </Text>
    </TouchableOpacity>
  );
}

function Chip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, isActive && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  title: { ...typography.title, color: colors.textPrimary },
  sectionTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  field: { gap: 4 },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  textarea: { minHeight: 96, textAlignVertical: "top" },
  hint: { ...typography.small, color: colors.textSecondary, lineHeight: 17 },
  pickerValue: { ...typography.body, color: colors.textPrimary },
  pickerPlaceholder: { ...typography.body, color: colors.textTertiary },
  quietRow: { flexDirection: "row", gap: spacing.md },
  quietCell: { flex: 1 },
  linkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
    marginTop: 4,
  },
  savedText: { ...typography.small, color: colors.success, fontWeight: "600" },
  costBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  costLine: { ...typography.caption, color: colors.textSecondary },
  costTotal: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  costWarn: { ...typography.small, color: colors.warning, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    minWidth: 40,
    alignItems: "center",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.textOnDark, fontWeight: "600" },
  notice: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  noticeText: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  secondaryButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: { ...typography.caption, color: colors.primary, fontWeight: "700" },
  presetBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  presetCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.separator,
    gap: 2,
  },
  presetTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  testBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  primaryButtonText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
  sendBox: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    gap: spacing.sm,
  },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cancelText: { ...typography.caption, color: colors.danger, fontWeight: "700" },
  errorText: { ...typography.small, color: colors.danger },
  statusButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  statusButtonDestructive: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  statusButtonText: { ...typography.caption, color: colors.textOnDark, fontWeight: "700" },
  statusButtonTextDestructive: { color: colors.danger },
});

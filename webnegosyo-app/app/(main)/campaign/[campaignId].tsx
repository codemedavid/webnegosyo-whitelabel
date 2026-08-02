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
import { router, useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../../../stores/auth-store";
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

export default function CampaignEditorScreen() {
  const { campaignId } = useLocalSearchParams<{ campaignId: string }>();
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantName = useAuthStore((s) => s.tenantName);
  const isNew = campaignId === NEW_CAMPAIGN_ID;

  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_CAMPAIGN_DRAFT);
  const [customers, setCustomers] = useState<SmsCustomer[]>([]);
  const [suppressedPhones, setSuppressedPhones] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dueRunId, setDueRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<CampaignStatus>("draft");
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
          const [state] = computeCampaignDueStates([scheduled], new Date());
          if (state.isDue && state.dueAt) {
            setDueRunId(await ensureRun(tenantId, row.id, state.dueAt));
          }
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

  const save = async () => {
    if (!tenantId || !validation.isValid) return;
    setIsSaving(true);
    try {
      if (isNew) await createCampaign(tenantId, draft);
      else await updateCampaign(String(campaignId), draft);
      router.back();
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

  const sendNow = () => {
    if (!tenantId || !dueRunId) return;
    Alert.alert(
      "Send this campaign?",
      `${audience.recipients.length} guests will get a text from this phone's SIM, ` +
        `costing about ${cost.totalSegments} SMS.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          style: "destructive",
          onPress: () =>
            run.start({
              tenantId,
              runId: dueRunId,
              template: draft.messageTemplate,
              storeName: tenantName ?? "our store",
              maxPerRun: draft.maxPerRun,
              audience: audience.recipients,
            }),
        },
      ]
    );
  };

  if (isLoading) return <LoadingState message="Loading campaign…" />;

  const canSend =
    Platform.OS === "android" && dueRunId !== null && audience.recipients.length > 0;

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
        <Field label="Date (YYYY-MM-DD)" error={validation.errors.scheduleDate}>
          <TextInput
            style={styles.input}
            value={draft.scheduleDate ?? ""}
            onChangeText={(scheduleDate) => patch({ scheduleDate: scheduleDate || null })}
            placeholder={today}
            placeholderTextColor={colors.textTertiary}
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

      <Field label="Send at (24-hour)" error={validation.errors.scheduleTime}>
        <TextInput
          style={styles.input}
          value={draft.scheduleTime}
          onChangeText={(scheduleTime) => patch({ scheduleTime })}
          placeholder="10:00"
          placeholderTextColor={colors.textTertiary}
        />
      </Field>

      <Text style={styles.hint}>
        Nothing sends between {draft.quietHoursStart} and {draft.quietHoursEnd}. A message
        scheduled inside those hours waits until morning.
      </Text>

      <TouchableOpacity
        style={[styles.primaryButton, !validation.isValid && styles.buttonDisabled]}
        onPress={save}
        disabled={!validation.isValid || isSaving}
      >
        <Text style={styles.primaryButtonText}>
          {isSaving ? "Saving…" : isNew ? "Create campaign" : "Save changes"}
        </Text>
      </TouchableOpacity>

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

      {!isNew && (
        <View style={styles.sendBox}>
          <Text style={styles.sectionTitle}>Send</Text>
          {Platform.OS !== "android" ? (
            <Text style={styles.hint}>
              Texts send from the Android app, using that phone&apos;s SIM.
            </Text>
          ) : !dueRunId ? (
            <Text style={styles.hint}>
              This campaign is not due yet. It will appear here when it is.
            </Text>
          ) : (
            <>
              {run.isRunning && run.progress && (
                <View style={styles.progressRow}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.hint}>
                    Sending {run.progress.attempted} of {run.progress.total}…
                  </Text>
                  <TouchableOpacity onPress={run.cancel}>
                    <Text style={styles.cancelText}>Stop</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!run.isRunning && (
                <TouchableOpacity
                  style={[styles.primaryButton, !canSend && styles.buttonDisabled]}
                  onPress={sendNow}
                  disabled={!canSend}
                >
                  <Text style={styles.primaryButtonText}>
                    Send to {audience.recipients.length} guests
                  </Text>
                </TouchableOpacity>
              )}
              {run.result && <RunSummary result={run.result} />}
              {run.error && <Text style={styles.errorText}>{run.error}</Text>}
            </>
          )}
        </View>
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

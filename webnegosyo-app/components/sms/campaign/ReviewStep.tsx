import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { OrchestratedRun } from "../../../lib/sms/run-orchestrator";
import type { CampaignStatus } from "../../../lib/sms/due-runs";
import type { StatusAction } from "../../../lib/sms/campaign-status";
import type { WizardStep } from "../../../lib/sms/campaign-wizard";
import { Button } from "../../Button";
import { Icon, type IconName } from "../../Icon";
import { MessagePreview } from "../MessagePreview";
import { StepIntro } from "./StepIntro";
import { colors, radius, spacing, typography } from "../../../theme/colors";

type PreviewProps = React.ComponentProps<typeof MessagePreview>;

/**
 * The last step of a new campaign, and the home screen of a saved one.
 *
 * Everything that decides what happens — the words, who, when, what it costs
 * — on one screen as three plain sentences, each one tap from being changed.
 * A saved campaign opens here rather than on a form: the merchant usually
 * came to send it, and the Send button is pinned under this summary.
 */

interface ReviewStepProps {
  isNew: boolean;
  name: string;
  preview: PreviewProps;
  audienceLine: string;
  recipientCount: number;
  scheduleLine: string;
  /** The step that still has a problem, if any. */
  problemStep: WizardStep | null;
  onEdit: (step: WizardStep) => void;
  /** Saved campaigns only. */
  status?: {
    value: CampaignStatus;
    label: string;
    nextLine: string | null;
    actions: StatusAction[];
    onChange: (next: CampaignStatus) => void;
  };
  isJustCreated: boolean;
  testSend: {
    isAvailable: boolean;
    phone: string;
    onChangePhone: (phone: string) => void;
    onSend: () => void;
    isSending: boolean;
    outcome: string | null;
  };
  runResult: OrchestratedRun | null;
  runError: string | null;
}

const STEP_NAMES: Partial<Record<WizardStep, string>> = {
  message: "the message",
  audience: "who gets it",
  schedule: "when it sends",
};

export function ReviewStep({
  isNew,
  name,
  preview,
  audienceLine,
  recipientCount,
  scheduleLine,
  problemStep,
  onEdit,
  status,
  isJustCreated,
  testSend,
  runResult,
  runError,
}: ReviewStepProps) {
  const [isTestOpen, setTestOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      {isJustCreated && (
        <View style={styles.created} accessibilityLiveRegion="polite">
          <View style={styles.createdIcon}>
            <Icon name="check" size={18} color={colors.textOnDark} strokeWidth={2.5} />
          </View>
          <View style={styles.createdCopy}>
            <Text style={styles.createdTitle}>Campaign saved and active</Text>
            <Text style={styles.createdHint}>
              This phone will remind you when it&apos;s time. Want to send it right now? Tap Send
              below.
            </Text>
          </View>
        </View>
      )}

      {isNew ? (
        <StepIntro title="Ready to go?" hint="Check the three things below. Tap any to change it." />
      ) : (
        <View style={styles.titleBlock}>
          <Text style={styles.title} accessibilityRole="header">
            {name || "Campaign"}
          </Text>
          {status && <StatusStrip {...status} />}
        </View>
      )}

      {runResult && <RunSummary result={runResult} />}
      {runError ? (
        <View style={styles.alert}>
          <Icon name="warning" size={18} color={colors.danger} />
          <Text style={styles.alertText}>{runError}</Text>
        </View>
      ) : null}

      <MessagePreview {...preview} />

      <View style={styles.facts}>
        <FactRow
          icon="message"
          label="Message"
          value={name || "Untitled campaign"}
          hasProblem={problemStep === "message"}
          onPress={() => onEdit("message")}
        />
        <FactRow
          icon="customers"
          label="Who"
          value={`${recipientCount} ${recipientCount === 1 ? "guest" : "guests"} · ${audienceLine}`}
          hasProblem={problemStep === "audience"}
          onPress={() => onEdit("audience")}
        />
        <FactRow
          icon="calendar"
          label="When"
          value={scheduleLine}
          hasProblem={problemStep === "schedule"}
          onPress={() => onEdit("schedule")}
          isLast
        />
      </View>
      {problemStep && STEP_NAMES[problemStep] ? (
        <Text style={styles.problem}>
          Fix {STEP_NAMES[problemStep]} before this can be saved.
        </Text>
      ) : null}

      {/*
        Available on a brand-new, unsaved campaign on purpose. Everything here
        is guesswork until the merchant has seen one of these land on a real
        handset.
      */}
      <View style={styles.test}>
        <TouchableOpacity
          style={styles.testHead}
          onPress={() => setTestOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isTestOpen }}
        >
          <Icon name="send" size={18} color={colors.textPrimary} />
          <View style={styles.testCopy}>
            <Text style={styles.testTitle}>Send a test to your own phone</Text>
            <Text style={styles.testHint}>See it land before your guests do. Not counted.</Text>
          </View>
          <Icon
            name={isTestOpen ? "chevron-down" : "chevron"}
            size={14}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        {isTestOpen && (
          <View style={styles.testBody}>
            {testSend.isAvailable ? (
              <View style={styles.testRow}>
                <TextInput
                  style={styles.testInput}
                  value={testSend.phone}
                  onChangeText={testSend.onChangePhone}
                  keyboardType="phone-pad"
                  placeholder="0917 123 4567"
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel="Your phone number"
                />
                <Button
                  label={testSend.isSending ? "Sending…" : "Send test"}
                  tone="secondary"
                  size="md"
                  onPress={testSend.onSend}
                  isLoading={testSend.isSending}
                />
              </View>
            ) : (
              <Text style={styles.testHint}>
                Test sending needs the Android app — it uses that phone&apos;s SIM.
              </Text>
            )}
            {testSend.outcome ? <Text style={styles.testOutcome}>{testSend.outcome}</Text> : null}
          </View>
        )}
      </View>
    </View>
  );
}

function StatusStrip({
  value,
  label,
  nextLine,
  actions,
  onChange,
}: NonNullable<ReviewStepProps["status"]>) {
  const isLive = value === "active";
  return (
    <View style={styles.status}>
      <View style={[styles.statusPill, isLive && styles.statusPillLive]}>
        <View style={[styles.statusDot, isLive && styles.statusDotLive]} />
        <Text style={[styles.statusLabel, isLive && styles.statusLabelLive]}>{label}</Text>
      </View>
      <Text style={styles.statusLine} numberOfLines={1}>
        {isLive ? nextLine ?? "On schedule" : IDLE_LINES[value]}
      </Text>
      <View style={styles.statusActions}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.next}
            onPress={() => onChange(action.next)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={action.isDestructive ? styles.statusActionQuiet : styles.statusAction}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function FactRow({
  icon,
  label,
  value,
  hasProblem,
  onPress,
  isLast,
}: {
  icon: IconName;
  label: string;
  value: string;
  hasProblem: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.fact, !isLast && styles.factDivided]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Edit.`}
    >
      <View style={[styles.factIcon, hasProblem && styles.factIconProblem]}>
        <Icon name={hasProblem ? "warning" : icon} size={18} color={hasProblem ? colors.danger : colors.textPrimary} />
      </View>
      <View style={styles.factCopy}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
      </View>
      <Text style={styles.factEdit}>Edit</Text>
    </TouchableOpacity>
  );
}

/** What a campaign that is not live will do on its own: nothing, said plainly. */
const IDLE_LINES: Record<CampaignStatus, string> = {
  active: "",
  draft: "Not live yet — activate it to get reminders",
  paused: "No reminders until you resume it",
  archived: "Finished — it won't send again",
};

const HALTED: Record<string, string> = {
  rate_limited:
    "Android paused outgoing texts. The rest are still waiting — try again in about 30 minutes.",
  aborted: "You stopped the run. The rest are still waiting.",
  log_failed:
    "A send could not be recorded, so the run stopped rather than risk texting someone twice.",
};

function RunSummary({ result }: { result: OrchestratedRun }) {
  const isClean = result.failedCount === 0 && result.remainingCount === 0 && !result.haltedReason;
  return (
    <View style={[styles.run, isClean && styles.runClean]}>
      <Icon
        name={isClean ? "check" : "info"}
        size={18}
        color={isClean ? colors.success : colors.textPrimary}
        strokeWidth={isClean ? 2.5 : 1.75}
      />
      <View style={styles.runCopy}>
        <Text style={styles.runTitle}>
          Sent to {result.sentCount} {result.sentCount === 1 ? "guest" : "guests"}
          {result.failedCount > 0 ? ` · ${result.failedCount} failed` : ""}
          {result.remainingCount > 0 ? ` · ${result.remainingCount} still waiting` : ""}
        </Text>
        {result.status === "claimed_elsewhere" && (
          <Text style={styles.runHint}>Another device is already sending this campaign.</Text>
        )}
        {result.haltedReason && <Text style={styles.runHint}>{HALTED[result.haltedReason]}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  created: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.successLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  createdIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  createdCopy: { flex: 1, gap: 2 },
  createdTitle: { ...typography.body, fontWeight: "800", color: colors.textPrimary },
  createdHint: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
  titleBlock: { gap: spacing.sm },
  title: { ...typography.title, fontSize: 26, letterSpacing: -0.4, color: colors.textPrimary },
  status: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  statusPillLive: { backgroundColor: colors.successLight },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textSecondary },
  statusDotLive: { backgroundColor: colors.success },
  statusLabel: { ...typography.small, fontWeight: "800", color: colors.textPrimary },
  statusLabelLive: { color: colors.statusReady.text },
  statusLine: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  statusActions: { flexDirection: "row", gap: spacing.lg, marginLeft: "auto" },
  statusAction: { ...typography.caption, color: colors.textPrimary, fontWeight: "800" },
  statusActionQuiet: { ...typography.caption, color: colors.danger, fontWeight: "700" },
  facts: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  factDivided: { borderBottomWidth: 1, borderBottomColor: colors.separator },
  factIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  factIconProblem: { backgroundColor: colors.dangerLight },
  factCopy: { flex: 1, gap: 2 },
  factLabel: { ...typography.small, color: colors.textSecondary, fontWeight: "700" },
  factValue: { ...typography.body, color: colors.textPrimary, fontWeight: "600", lineHeight: 20 },
  factEdit: { ...typography.caption, color: colors.textPrimary, fontWeight: "800" },
  problem: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  alert: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  alertText: { ...typography.caption, color: colors.textPrimary, flex: 1, lineHeight: 18 },
  test: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  testHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  testCopy: { flex: 1, gap: 2 },
  testTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  testHint: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  testBody: {
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  testRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  testInput: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    height: 44,
    ...typography.body,
    color: colors.textPrimary,
  },
  testOutcome: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
  run: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  runClean: { backgroundColor: colors.successLight },
  runCopy: { flex: 1, gap: 4 },
  runTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  runHint: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
});

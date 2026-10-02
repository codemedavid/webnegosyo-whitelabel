import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  STATUS_LABELS,
  nextStatusAction,
  rewardSteps,
  type LoyaltyProgramSummary,
} from "../../lib/loyalty/programs";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { RewardCardPreview } from "./RewardCardPreview";

interface ProgramCardProps {
  program: LoyaltyProgramSummary;
  branchName: string;
  isBusy: boolean;
  onEdit: () => void;
  onStatus: (to: "active" | "paused" | "ended") => void;
}

const STATUS_TONE: Record<LoyaltyProgramSummary["status"], { bg: string; fg: string }> = {
  draft: { bg: colors.warningLight, fg: "#92400E" },
  active: { bg: colors.successLight, fg: colors.success },
  paused: { bg: colors.infoLight, fg: colors.info },
  ended: { bg: colors.primaryLight, fg: colors.textSecondary },
};

/** One programme, drawn as the card itself, with the one move its status allows. */
export function ProgramCard({ program, branchName, isBusy, onEdit, onStatus }: ProgramCardProps) {
  const action = nextStatusAction(program.status);
  const tone = STATUS_TONE[program.status];
  const rules = program.rules;
  const expiry = rules?.rewardExpiryDays ? `Rewards expire after ${rules.rewardExpiryDays} days` : "Rewards never expire";

  return (
    <View style={styles.wrap}>
      {rules ? (
        <RewardCardPreview name={program.name} earnMode={rules.earnMode} threshold={rules.threshold} steps={rewardSteps(rules)} />
      ) : (
        <View style={styles.noRules}><Text style={styles.meta}>{program.name}: rules not set</Text></View>
      )}

      <View style={styles.info}>
        <View style={styles.row}>
          <Text style={[styles.status, { backgroundColor: tone.bg, color: tone.fg }]}>
            {program.status === "active" ? "● " : ""}{STATUS_LABELS[program.status]}
          </Text>
          <Text style={styles.stat}>👥 {program.members}</Text>
          <Text style={styles.stat}>🎁 {program.rewardsOutstanding} unclaimed</Text>
        </View>
        <Text style={styles.meta}>
          {branchName} · {expiry}
          {rules?.minSpend ? ` · ₱${rules.minSpend}+ orders` : ""}
          {program.versionNumber ? ` · rules v${program.versionNumber}` : ""}
        </Text>
        {program.activatesAt ? (
          <Text style={styles.meta}>
            Earns from {new Date(program.activatesAt).toLocaleDateString("en-PH")}
            {program.endsAt ? ` until ${new Date(program.endsAt).toLocaleDateString("en-PH")}` : ""}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {program.status !== "ended" ? (
            <TouchableOpacity style={styles.ghost} onPress={onEdit} disabled={isBusy} accessibilityRole="button">
              <Text style={styles.ghostLabel}>✏️ Edit card</Text>
            </TouchableOpacity>
          ) : null}
          {action ? (
            <TouchableOpacity
              style={[styles.primary, action.to === "active" && styles.primaryGo]}
              onPress={() => onStatus(action.to)}
              disabled={isBusy}
              accessibilityRole="button"
            >
              <Text style={styles.primaryLabel}>{isBusy ? "Saving…" : action.to === "active" ? `🚀 ${action.label}` : action.label}</Text>
            </TouchableOpacity>
          ) : null}
          {program.status !== "draft" && program.status !== "ended" ? (
            <TouchableOpacity
              style={styles.ghost}
              disabled={isBusy}
              accessibilityRole="button"
              onPress={() => Alert.alert("End this program?", "New orders will stop earning. Rewards already issued keep their terms.", [
                { text: "Cancel", style: "cancel" },
                { text: "End program", style: "destructive", onPress: () => onStatus("ended") },
              ])}
            >
              <Text style={styles.ghostLabel}>End</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.card, borderRadius: 26, padding: spacing.sm, gap: spacing.sm },
  noRules: { padding: spacing.lg },
  info: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  status: { ...typography.caption, fontWeight: "800", paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.full, overflow: "hidden" },
  stat: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  ghost: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle },
  ghostLabel: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  primary: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: "center" },
  primaryGo: { backgroundColor: colors.success },
  primaryLabel: { ...typography.body, fontWeight: "800", color: colors.textOnDark },
});

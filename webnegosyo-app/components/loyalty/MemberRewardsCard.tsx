import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import type { LoyaltyMemberReward } from "../../lib/loyalty/members";
import { resolveMemberReward } from "../../lib/loyalty/members-repo";

const CLAIMABLE = new Set(["issued", "restored"]);

const STATUS_LABELS: Record<string, string> = {
  issued: "Ready to use",
  restored: "Ready to use",
  reserved: "In a sale right now",
  consumed: "Used",
  expired: "Expired",
  voided: "Cancelled",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString("en-PH") : "";
}

function isExpired(reward: LoyaltyMemberReward): boolean {
  if (!reward.expiresAt) return false;
  const ms = Date.parse(reward.expiresAt);
  return Number.isFinite(ms) && ms < Date.now();
}

/**
 * The rewards this customer holds, and the two things a counter can do to one.
 *
 * Neither action moves stamps. The balance was already spent to mint the
 * reward, and handing the stamps back would silently re-arm the next earn — a
 * merchant who wants the stamps back makes an adjustment, which says so in the
 * ledger. A reward a register is holding mid-sale cannot be touched here at
 * all; the platform refuses it, and so does this card.
 */
export function MemberRewardsCard({
  tenantId,
  rewards,
  onChanged,
  onError,
}: {
  tenantId: string | null;
  rewards: LoyaltyMemberReward[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [action, setAction] = useState<"consume" | "void">("consume");
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const submit = async (reward: LoyaltyMemberReward) => {
    if (!tenantId) return;
    if (!note.trim()) {
      onError("Say what happened to this reward.");
      return;
    }
    setBusyId(reward.id);
    const result = await resolveMemberReward(tenantId, {
      entitlementId: reward.id,
      action,
      note: note.trim(),
    });
    setBusyId(null);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setOpenId(null);
    setNote("");
    onChanged();
  };

  const claimable = rewards.filter((reward) => CLAIMABLE.has(reward.status) && !isExpired(reward));
  const settled = rewards.filter((reward) => !claimable.includes(reward));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Rewards</Text>

      {rewards.length === 0 ? (
        <Text style={styles.muted}>
          No rewards yet. One is issued automatically the moment a card fills up.
        </Text>
      ) : null}

      {claimable.map((reward) => (
        <View key={reward.id} style={styles.reward}>
          <View style={styles.rewardHeader}>
            <Text style={styles.rewardLabel}>{reward.label}</Text>
            <View style={styles.readyBadge}>
              <Text style={styles.readyBadgeLabel}>Ready</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {reward.programName}
            {reward.issuedAt ? ` · earned ${formatDate(reward.issuedAt)}` : ""}
            {reward.expiresAt ? ` · expires ${formatDate(reward.expiresAt)}` : " · never expires"}
          </Text>

          {openId === reward.id ? (
            <View style={styles.form}>
              <View style={styles.choices}>
                {(
                  [
                    { value: "consume" as const, label: "They used it" },
                    { value: "void" as const, label: "Cancel it" },
                  ]
                ).map((choice) => (
                  <TouchableOpacity
                    key={choice.value}
                    style={[styles.choice, action === choice.value && styles.choiceActive]}
                    onPress={() => setAction(choice.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: action === choice.value }}
                  >
                    <Text
                      style={[
                        styles.choiceLabel,
                        action === choice.value && styles.choiceLabelActive,
                      ]}
                    >
                      {choice.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder={
                  action === "consume"
                    ? "e.g. Honoured at the counter, receipt 0412"
                    : "e.g. Issued by mistake after a refund"
                }
                placeholderTextColor={colors.textSecondary}
                value={note}
                onChangeText={setNote}
                multiline
                accessibilityLabel="Reason"
              />
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.button}
                  disabled={busyId === reward.id}
                  onPress={() => void submit(reward)}
                >
                  <Text style={styles.buttonLabel}>
                    {busyId === reward.id ? "Saving…" : "Save"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ghost}
                  onPress={() => {
                    setOpenId(null);
                    setNote("");
                  }}
                >
                  <Text style={styles.ghostLabel}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.ghost}
              onPress={() => {
                setOpenId(reward.id);
                setAction("consume");
                setNote("");
              }}
            >
              <Text style={styles.ghostLabel}>Settle this reward</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {settled.length > 0 ? (
        <View style={styles.history}>
          <Text style={styles.subTitle}>Past rewards</Text>
          {settled.map((reward) => (
            <View key={reward.id} style={styles.settledRow}>
              <Text style={styles.settledLabel} numberOfLines={1}>
                {reward.label}
              </Text>
              <Text style={styles.settledStatus}>
                {isExpired(reward) && CLAIMABLE.has(reward.status)
                  ? "Expired"
                  : STATUS_LABELS[reward.status] ?? reward.status}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  subTitle: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  muted: { ...typography.caption, color: colors.textSecondary },
  reward: {
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rewardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rewardLabel: { ...typography.body, fontWeight: "800", color: colors.textPrimary, flex: 1 },
  readyBadge: { backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  readyBadgeLabel: { fontSize: 11, fontWeight: "700", color: colors.textOnDark },
  meta: { ...typography.small, color: colors.textSecondary },
  form: { gap: spacing.sm, marginTop: spacing.xs },
  choices: { flexDirection: "row", gap: spacing.xs },
  choice: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
  },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceLabel: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  choiceLabelActive: { color: colors.textOnDark, fontWeight: "700" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 64,
    ...typography.body,
    color: colors.textPrimary,
    textAlignVertical: "top",
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  button: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  buttonLabel: { ...typography.body, fontWeight: "700", color: colors.textOnDark },
  ghost: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  ghostLabel: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  history: { gap: spacing.xs, marginTop: spacing.xs },
  settledRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  settledLabel: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  settledStatus: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
});

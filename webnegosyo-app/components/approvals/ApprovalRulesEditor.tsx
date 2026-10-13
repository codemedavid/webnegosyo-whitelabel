import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { changeSentence, diffRules, lastChangedLine, RULE_FIELDS, rulesPatch, type RulesPatch } from "../../lib/approvals/rules-form";
import type { ApprovalRules } from "../../lib/approvals/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { StaffAvatar } from "../staff/StaffAvatar";
import { RulesSentenceRow } from "./RulesSentenceRow";

export type SaveRulesResult = { ok: true } | { ok: false; error: string };

interface ApprovalRulesEditorProps {
  rules: ApprovalRules;
  approvers: readonly { userId: string; name: string | null; outletId: string | null }[];
  outletName: (outletId: string) => string | null;
  isOffline: boolean;
  onSave: (patch: RulesPatch) => Promise<SaveRulesResult>;
  onOpenTeam: () => void;
}

/**
 * The owner's approval rules as plain sentences (design-spec §3.10). The
 * "Save changes" dock appears only when something changed, and lists each
 * change ("Staff refund limit: ₱300 → ₱500") before it is sent; the server
 * records every change in Activity.
 */
export function ApprovalRulesEditor({ rules, approvers, outletName, isOffline, onSave, onOpenTeam }: ApprovalRulesEditorProps) {
  const [draft, setDraft] = useState<ApprovalRules>(rules);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);

  // A fresh read from the server replaces the draft (after a save, or another device's).
  useEffect(() => setDraft(rules), [rules]);

  const changes = diffRules(rules, draft);
  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await onSave(rulesPatch(rules, draft));
    setSaving(false);
    if (result.ok) setSaved(changes.map(changeSentence));
    else setError(result.error);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {saved ? (
          <View style={styles.saved} accessibilityRole="alert">
            <Icon name="check" size={18} color={colors.statusReady.text} />
            <View style={styles.savedCopy}>
              <Text style={styles.savedTitle}>Rules saved</Text>
              {saved.map((line) => (
                <Text key={line} style={styles.savedLine}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.card}>
          {RULE_FIELDS.map((field) => (
            <RulesSentenceRow
              key={field.key}
              field={field}
              value={draft[field.key]}
              onChange={(value) => {
                setSaved(null);
                setDraft((current) => ({ ...current, [field.key]: value }));
              }}
            />
          ))}
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Staff refunds without asking only on orders from the same day</Text>
            <Switch
              value={draft.staffRefundWindow === "same_day"}
              onValueChange={(isSameDay) => {
                setSaved(null);
                setDraft((current) => ({ ...current, staffRefundWindow: isSameDay ? "same_day" : "any" }));
              }}
              accessibilityLabel="Staff refunds without asking only on orders from the same day"
            />
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>Who can approve</Text>
          {approvers.length === 0 ? <Text style={styles.meta}>{"Only you, for now."}</Text> : null}
          {approvers.map((approver) => (
            <View key={approver.userId} style={styles.person}>
              <StaffAvatar name={approver.name ?? "Staff"} seed={approver.userId} size="sm" />
              <View style={styles.personCopy}>
                <Text style={styles.personName}>{approver.name ?? "Staff"}</Text>
                <Text style={styles.meta}>{approver.outletId ? outletName(approver.outletId) ?? "One branch" : "Every branch"}</Text>
              </View>
            </View>
          ))}
          <Button label="Give someone access" tone="ghost" icon="customers" onPress={onOpenTeam} />
        </View>
        <Text style={styles.footer}>{lastChangedLine(rules)}</Text>
      </ScrollView>
      {changes.length > 0 ? (
        <View style={styles.dock}>
          {changes.map((change) => (
            <Text key={change.label} style={styles.change}>
              {changeSentence(change)}
            </Text>
          ))}
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {isOffline ? <Text style={styles.meta}>{"You're offline. Connect to save."}</Text> : null}
          <Button label="Save changes" size="lg" onPress={() => void save()} isLoading={isSaving} disabled={isOffline} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  heading: { ...typography.heading, color: colors.textPrimary, paddingVertical: spacing.sm },
  meta: { ...typography.caption, color: colors.textMuted },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm },
  switchText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52 },
  personCopy: { flex: 1, gap: 2 },
  personName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  footer: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  saved: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.successLight },
  savedCopy: { flex: 1, gap: 2 },
  savedTitle: { ...typography.body, fontWeight: "700", color: colors.statusReady.text },
  savedLine: { ...typography.caption, color: colors.statusReady.text },
  dock: {
    gap: spacing.xs,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  change: { ...typography.caption, color: colors.textPrimary },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
});

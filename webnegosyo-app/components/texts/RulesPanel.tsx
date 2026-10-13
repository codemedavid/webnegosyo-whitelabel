import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from "react-native";

import { Button } from "../Button";
import { OptionPills } from "../OptionPills";
import { SectionHeader } from "../SectionHeader";
import { LoyaltySmsDeviceCard, useCanEnrollSmsDevice } from "../LoyaltySmsDeviceCard";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { automationsApi, type AutomationsView, type TextingRules } from "../../lib/sms-automations/api";
import {
  dailyLimitChoices,
  guestCapChoices,
  quietHourChoices,
  quietKey,
  reviewUrlProblem,
  RULE_WHY,
  sameRules,
  withQuietHours,
} from "../../lib/sms-automations/rules";
import { pacingLine } from "../../lib/sms-automations/view";
import { isBlockedByDemo } from "./use-automation-switch";

interface RulesPanelProps {
  tenantId: string | null;
  view: AutomationsView;
  onSaved: () => void;
  /** Where the Sending phone section sits, so the sender strip can scroll to it. */
  onPhoneSectionLayout: (y: number) => void;
}

/**
 * The store-wide rules every automation obeys, then the phone that sends.
 * One Save for the rules; the server's refusal is shown as it comes.
 */
export function RulesPanel({ tenantId, view, onSaved, onPhoneSectionLayout }: RulesPanelProps) {
  const [draft, setDraft] = useState<TextingRules>(view.settings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const canEnroll = useCanEnrollSmsDevice();

  // A fresh read with different rules (another device, Owl) replaces the
  // draft only while the owner has not touched it.
  const [baseline, setBaseline] = useState<TextingRules>(view.settings);
  if (!sameRules(baseline, view.settings)) {
    setBaseline(view.settings);
    if (sameRules(draft, baseline)) setDraft(view.settings);
  }

  const isDirty = !sameRules(draft, view.settings);
  const urlProblem = reviewUrlProblem(draft.reviewUrl ?? "");
  const update = (patch: Partial<TextingRules>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setSavedNote(false);
    setError(null);
  };

  const save = async () => {
    if (!tenantId || urlProblem || isBlockedByDemo()) return;
    setIsSaving(true);
    setError(null);
    const reviewUrl = (draft.reviewUrl ?? "").trim() || null;
    const result = await automationsApi.saveRules(tenantId, { ...draft, reviewUrl, optOutLine: view.settings.optOutLine });
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedNote(true);
    onSaved();
  };

  return (
    <View>
      <SectionHeader title="Review link" hint={RULE_WHY.reviewUrl} style={styles.first} />
      <TextInput
        style={[styles.input, urlProblem ? styles.inputBad : null]}
        value={draft.reviewUrl ?? ""}
        onChangeText={(reviewUrl) => update({ reviewUrl })}
        placeholder="https://g.page/r/your-store/review"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel="Review link"
      />
      {urlProblem ? <Text style={styles.error}>{urlProblem}</Text> : null}

      <SectionHeader title="Quiet hours" hint={RULE_WHY.quietHours} />
      <OptionPills
        options={quietHourChoices(view.settings)}
        isSelected={(value) => value === quietKey(draft)}
        onSelect={(key) => update(withQuietHours(draft, key))}
        accessibilityPrefix="No texts"
      />

      <SectionHeader title="One text per guest every" hint={RULE_WHY.guestCap} />
      <OptionPills
        options={guestCapChoices(view.settings.guestCapDays)}
        isSelected={(value) => value === draft.guestCapDays}
        onSelect={(guestCapDays) => update({ guestCapDays })}
        accessibilityPrefix="One text per guest every"
      />

      <SectionHeader title="Daily limit" hint={RULE_WHY.dailyLimit} />
      <OptionPills
        options={dailyLimitChoices(view.settings.dailyLimit)}
        isSelected={(value) => value === draft.dailyLimit}
        onSelect={(dailyLimit) => update({ dailyLimit })}
        accessibilityPrefix="At most"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {savedNote && !isDirty ? <Text style={styles.saved}>Saved. Every automation follows these rules now.</Text> : null}
      <Button
        label="Save rules"
        onPress={() => void save()}
        isLoading={isSaving}
        disabled={!isDirty || urlProblem !== null}
        size="lg"
        style={styles.save}
      />

      <View onLayout={(event: LayoutChangeEvent) => onPhoneSectionLayout(event.nativeEvent.layout.y)}>
        <SectionHeader title="Sending phone" />
        <View style={styles.explain}>
          <Text style={styles.explainText}>
            Texts go out from an Android phone at your store, using its SIM and load. Keep it charged and on.{" "}
            {pacingLine(view.settings)}.
          </Text>
          {!canEnroll ? (
            <Text style={styles.explainHint}>
              Set it up from the owner’s account on that Android phone: open Texts there, Rules tab.
            </Text>
          ) : null}
        </View>
        <LoyaltySmsDeviceCard />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  first: { marginTop: 0 },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputBad: { borderColor: colors.danger },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
  saved: { ...typography.caption, color: colors.success, fontWeight: "600", marginTop: spacing.lg },
  save: { marginTop: spacing.lg },
  explain: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md, ...shadow.sm },
  explainText: { ...typography.caption, color: colors.textPrimary, lineHeight: 19 },
  explainHint: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },
});

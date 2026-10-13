import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Button } from "../../Button";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { automationsApi, type RecipeId } from "../../../lib/sms-automations/api";
import type { MessageLanguage } from "../../../lib/sms-automations/editor";
import { isBlockedByDemo } from "../use-automation-switch";

interface WriteForMeProps {
  tenantId: string | null;
  recipe: RecipeId;
  language: MessageLanguage;
  /** The message box holds the owner's own words (not a starter, not a draft from here). */
  hasOwnWords: (drafts: readonly string[]) => boolean;
  onPick: (text: string) => void;
}

type Drafts =
  | { state: "idle" }
  | { state: "writing" }
  | { state: "ready"; messages: string[] }
  | { state: "failed"; error: string };

/**
 * "Write it for me": the server asks the model for three messages and keeps
 * only the ones that pass its rules (no invented offers, numbers or links;
 * plain letters; two texts at most). The owner taps one to put it in the box —
 * nothing is saved until they tap Save.
 */
export function WriteForMe({ tenantId, recipe, language, hasOwnWords, onPick }: WriteForMeProps) {
  const [drafts, setDrafts] = useState<Drafts>({ state: "idle" });
  const messages = drafts.state === "ready" ? drafts.messages : [];

  const write = async () => {
    if (!tenantId || drafts.state === "writing" || isBlockedByDemo()) return;
    setDrafts({ state: "writing" });
    const result = await automationsApi.write(tenantId, recipe, language);
    setDrafts(result.ok ? { state: "ready", messages: result.value.messages } : { state: "failed", error: result.error });
  };

  const pick = (text: string) => {
    if (!hasOwnWords(messages)) {
      onPick(text);
      return;
    }
    Alert.alert("Replace your message?", "Your own words in the box will be replaced with this one.", [
      { text: "Keep mine", style: "cancel" },
      { text: "Replace", style: "destructive", onPress: () => onPick(text) },
    ]);
  };

  const isWriting = drafts.state === "writing";
  return (
    <View style={styles.wrap}>
      <Button
        label={messages.length > 0 ? "Write three more" : "Write it for me"}
        tone="secondary"
        size="sm"
        icon="edit"
        onPress={() => void write()}
        disabled={isWriting}
        accessibilityHint="Suggests three messages in the language picked above"
      />
      {isWriting ? (
        <View style={styles.writing}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text style={styles.note}>Writing three options…</Text>
        </View>
      ) : null}
      {drafts.state === "failed" ? <Text style={styles.error}>{drafts.error}</Text> : null}
      {messages.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.note}>Tap one to use it. You can still edit it.</Text>
          {messages.map((message) => (
            <TouchableOpacity
              key={message}
              style={styles.option}
              onPress={() => pick(message)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Use this message: ${message}`}
            >
              <Text style={styles.optionText}>{message}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, alignItems: "flex-start" },
  writing: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  note: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, lineHeight: 18 },
  list: { gap: spacing.sm, alignSelf: "stretch" },
  option: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  optionText: { ...typography.body, color: colors.textPrimary, lineHeight: 21 },
});

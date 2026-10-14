import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { SegmentedControl } from "../../SegmentedControl";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import type { RecipeInfo } from "../../../lib/sms-automations/api";
import {
  defaultMessageFor,
  insertWord,
  LANGUAGE_OPTIONS,
  MAX_MESSAGE_CHARS,
  messageLanguage,
  type MessageLanguage,
  type Selection,
} from "../../../lib/sms-automations/editor";
import { VARIABLE_LABELS } from "../../../lib/sms-automations/view";
import { WriteForMe } from "./WriteForMe";

interface MessageEditorProps {
  tenantId: string | null;
  info: RecipeInfo;
  value: string;
  /** Why the message cannot be saved; the box turns red and the footer says why. */
  problem: string | null;
  onChange: (text: string) => void;
}

/**
 * The message box, the words a guest's own details fill in (tap to insert at
 * the cursor), and English / Taglish starters. Switching language swaps the
 * starter only while the owner has not edited it; otherwise it asks first.
 */
export function MessageEditor({ tenantId, info, value, problem, onChange }: MessageEditorProps) {
  const [selection, setSelection] = useState<Selection>({ start: value.length, end: value.length });
  const [chosen, setChosen] = useState<MessageLanguage>(() => messageLanguage(value, info) ?? "en");
  const shownLanguage = messageLanguage(value, info) ?? chosen;

  const insert = (word: string) => {
    const next = insertWord(value, selection, word);
    onChange(next.text);
    setSelection({ start: next.cursor, end: next.cursor });
  };

  const takeWritten = (text: string) => {
    onChange(text);
    setSelection({ start: text.length, end: text.length });
  };
  const hasOwnWords = (drafts: readonly string[]) =>
    value.trim() !== "" && messageLanguage(value, info) === null && !drafts.includes(value.trim());

  const pickLanguage = (language: MessageLanguage) => {
    if (language === shownLanguage) return;
    const swap = () => {
      setChosen(language);
      const text = defaultMessageFor(info, language);
      onChange(text);
      setSelection({ start: text.length, end: text.length });
    };
    if (messageLanguage(value, info) !== null) {
      swap();
      return;
    }
    const name = LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ?? language;
    Alert.alert("Replace your message?", `Your edits will be replaced with the ${name} starter message.`, [
      { text: "Keep mine", style: "cancel" },
      { text: "Replace", style: "destructive", onPress: swap },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <SegmentedControl
        options={LANGUAGE_OPTIONS}
        value={messageLanguage(value, info) === null ? null : shownLanguage}
        onChange={pickLanguage}
        accessibilityPrefix="Starter message in"
      />
      <TextInput
        style={[styles.input, problem ? styles.inputBad : null]}
        value={value}
        onChangeText={onChange}
        selection={selection}
        onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
        multiline
        maxLength={MAX_MESSAGE_CHARS}
        textAlignVertical="top"
        placeholder="Write what your guests will read"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Message"
      />
      <Text style={styles.chipsLabel}>Tap to add a guest’s details</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {info.variables.map((word) => (
          <TouchableOpacity
            key={word}
            style={styles.chip}
            onPress={() => insert(word)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Insert ${VARIABLE_LABELS[word] ?? word}`}
          >
            <Text style={styles.chipText}>{VARIABLE_LABELS[word] ?? word}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* Remounts per language so drafts never sit under the other language's toggle. */}
      <WriteForMe
        key={shownLanguage}
        tenantId={tenantId}
        recipe={info.id}
        language={shownLanguage}
        hasOwnWords={hasOwnWords}
        onPick={takeWritten}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  input: {
    minHeight: 130,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  inputBad: { borderColor: colors.danger },
  chipsLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  chips: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
  },
  chipText: { ...typography.caption, color: colors.accent, fontWeight: "700" },
});

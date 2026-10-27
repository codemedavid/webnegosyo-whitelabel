import React, { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet, sheetText } from "../drawer/DrawerSheet";

export type NoteResult = { ok: true } | { ok: false; error: string };

interface NoteSheetProps {
  title: string;
  /** What the action skips or changes, said before the note. */
  lines: readonly string[];
  noteLabel: string;
  placeholder: string;
  isNoteRequired: boolean;
  confirmLabel: string;
  tone?: "primary" | "danger";
  isOffline: boolean;
  onConfirm: (note: string) => Promise<NoteResult>;
  onClose: () => void;
}

/** "Close anyway?" and "Reopen this day?": what happens, a note, one button. */
export function NoteSheet({ title, lines, noteLabel, placeholder, isNoteRequired, confirmLabel, tone = "primary", isOffline, onConfirm, onClose }: NoteSheetProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  const confirm = async () => {
    if (isNoteRequired && !note.trim()) {
      setError(`Add a note: ${noteLabel.toLowerCase()}.`);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onConfirm(note);
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <DrawerSheet visible title={title} onClose={onClose} isBusy={isBusy}>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
      <Text style={sheetText.label}>{noteLabel}</Text>
      <TextInput
        style={styles.note}
        value={note}
        onChangeText={(next) => {
          setNote(next);
          setError(null);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        maxLength={300}
        multiline
        editable={!isBusy}
        accessibilityLabel={noteLabel}
      />
      {isOffline ? <Text style={sheetText.hint}>{"You're offline. Connect to do this."}</Text> : null}
      {error ? (
        <Text style={sheetText.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button label={confirmLabel} tone={tone} size="lg" fullWidth onPress={() => void confirm()} isLoading={isBusy} disabled={isOffline || isBusy} />
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  line: { ...typography.body, color: colors.textPrimary },
  note: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 72,
    textAlignVertical: "top",
  },
});

import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { centeredDialog, useCenteredDialog } from "./dialog-layout";
import { KITCHEN_NOTE_LABEL, KitchenNoteField } from "./KitchenNoteField";
import { useScrollNoteIntoView } from "./use-scroll-note-into-view";
import { normalizeLineNote } from "../../lib/pos-cart";

interface LineNoteSheetProps {
  visible: boolean;
  /** The dish the note is for, shown as the title. */
  itemName: string;
  /** The line's current note, if any. */
  initialNote?: string;
  /** Why the last save was refused; shown above the buttons, sheet stays open. */
  error?: string | null;
  onCancel: () => void;
  /** Called with the trimmed note, or "" to clear it. */
  onSave: (note: string) => void;
}

/**
 * "Note for the kitchen" on one cart line: quick chips, free text, Save / Clear.
 * The note prints on the kitchen ticket, the chit and the receipt.
 */
export function LineNoteSheet({
  visible,
  itemName,
  initialNote,
  error = null,
  onCancel,
  onSave,
}: LineNoteSheetProps) {
  const [draft, setDraft] = useState(initialNote ?? "");
  const isCentered = useCenteredDialog();
  const hasNote = Boolean(initialNote);
  const { scrollRef, onNoteFocus } = useScrollNoteIntoView();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={[styles.backdrop, isCentered && centeredDialog.backdrop]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.sheet, isCentered && centeredDialog.sheet]}>
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={styles.title} numberOfLines={1}>
                {KITCHEN_NOTE_LABEL}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {itemName}
              </Text>
            </View>
            <IconButton icon="close" onPress={onCancel} label="Close" />
          </View>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <KitchenNoteField
              value={draft}
              onChange={setDraft}
              autoFocus={!hasNote}
              showLabel={false}
              onFocus={onNoteFocus}
            />
          </ScrollView>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <View style={styles.footer}>
            {hasNote ? (
              <Button
                label="Clear note"
                tone="danger"
                icon="trash"
                onPress={() => onSave("")}
                accessibilityLabel="Clear the kitchen note"
              />
            ) : null}
            <Button
              label="Save note"
              icon="check"
              onPress={() => onSave(normalizeLineNote(draft) ?? "")}
              style={styles.save}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  heading: { flex: 1 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textMuted },
  body: { padding: spacing.xl },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  save: { flex: 1 },
  error: {
    ...typography.caption,
    color: colors.danger,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
});

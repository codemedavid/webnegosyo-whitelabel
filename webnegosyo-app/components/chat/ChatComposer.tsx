import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Icon } from "../Icon";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { STAFF_TEXT_MAX, type StaffChip } from "../../lib/messenger-chat/staff-chat";

interface ChatComposerProps {
  chips: readonly StaffChip[];
  /** Why nothing can be sent (24 hours passed, no Page). Null = the composer is live. */
  lockedReason: string | null;
  /** A short "you can reply for 2 h more" when the window is closing. */
  windowNote: string | null;
  draft: string;
  onChangeDraft: (text: string) => void;
  onSend: () => void;
  onChip: (chip: StaffChip) => void;
  /** Open Business Suite (shown with the lock). */
  onOpenInbox: () => void;
  /** Make order: ring up what they asked for (null = this account can't). */
  onMakeOrder: (() => void) | null;
  bottomInset: number;
}

/**
 * The bottom of a chat: one row of quick actions (what the bot would send,
 * by hand), then the reply box. After 24 hours Messenger refuses any reply
 * from the app, so the box gives way to a plain note and Business Suite.
 */
export function ChatComposer(props: ChatComposerProps) {
  const { chips, lockedReason, windowNote, draft, onChangeDraft, onSend, onChip, onOpenInbox, onMakeOrder, bottomInset } = props;
  const canSend = draft.trim().length > 0;

  if (lockedReason) {
    return (
      <View style={[styles.footer, { paddingBottom: bottomInset }]}>
        <View style={styles.locked}>
          <Icon name="lock" size={16} color={colors.textMuted} />
          <Text style={styles.lockedText}>{lockedReason}</Text>
        </View>
        <View style={styles.lockedActions}>
          {onMakeOrder ? (
            <TouchableOpacity style={styles.secondary} onPress={onMakeOrder} accessibilityRole="button" accessibilityHint="Opens the register for this customer">
              <Text style={styles.secondaryText}>Make order</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.secondary} onPress={onOpenInbox} accessibilityRole="button">
            <Text style={styles.secondaryText}>Reply in Business Suite</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.footer, { paddingBottom: bottomInset }]}>
      {windowNote ? <Text style={styles.windowNote}>{windowNote}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {onMakeOrder ? (
          <TouchableOpacity style={[styles.chip, styles.chipStrong]} onPress={onMakeOrder} accessibilityRole="button" accessibilityHint="Opens the register for this customer">
            <Text style={[styles.chipText, styles.chipTextStrong]}>Make order</Text>
          </TouchableOpacity>
        ) : null}
        {chips.map((chip) => (
          <TouchableOpacity
            key={`${chip.card}:${chip.orderId ?? ""}`}
            style={[styles.chip, chip.card === "cart" && styles.chipCart]}
            onPress={() => onChip(chip)}
            accessibilityRole="button"
            accessibilityHint="Shows what they will get before it is sent"
          >
            <Text style={[styles.chipText, chip.card === "cart" && styles.chipTextCart]}>{chip.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={onChangeDraft}
          placeholder="Reply…"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={STAFF_TEXT_MAX}
          accessibilityLabel="Reply to the customer"
        />
        <TouchableOpacity
          style={[styles.send, !canSend && styles.sendOff]}
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send reply"
          accessibilityState={{ disabled: !canSend }}
        >
          <Icon name="send" size={18} color={colors.textOnDark} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingTop: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  windowNote: { ...typography.small, color: colors.statusPending.text, paddingHorizontal: spacing.lg },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  chipStrong: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipCart: { backgroundColor: colors.accentLight, borderColor: colors.accentLight },
  chipText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  chipTextStrong: { color: colors.textOnDark },
  chipTextCart: { color: colors.statusPreparing.text },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 12,
    ...typography.body,
    color: colors.textPrimary,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  sendOff: { backgroundColor: colors.textTertiary },
  locked: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "flex-start" },
  lockedText: { ...typography.caption, color: colors.textMuted, flex: 1 },
  lockedActions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg },
  secondary: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  secondaryText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
});

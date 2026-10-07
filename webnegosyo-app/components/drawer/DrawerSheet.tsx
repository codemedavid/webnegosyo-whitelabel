import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from "react-native";
import { Modal } from "../Modal";

import { centeredDialog, useCenteredDialog } from "../pos/dialog-layout";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface DrawerSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Closing is refused while a write is in flight. */
  isBusy?: boolean;
  children: React.ReactNode;
}

/**
 * The bottom sheet every cash action opens in — count, pay in/out, pickup,
 * till setup. Docked on a phone, centred on a tablet (the register's own
 * dialog rule), lifted above the keyboard, and never dismissed mid-write.
 */
export function DrawerSheet({ visible, title, subtitle, onClose, isBusy = false, children }: DrawerSheetProps) {
  const isCentered = useCenteredDialog();
  const close = () => {
    if (!isBusy) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={[styles.backdrop, isCentered && centeredDialog.backdrop]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={close}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, isCentered && centeredDialog.sheet]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {!isCentered && <View style={styles.grabber} />}
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title} accessibilityRole="header">
                  {title}
                </Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              <TouchableOpacity
                onPress={close}
                disabled={isBusy}
                style={styles.closeHit}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.close}>Cancel</Text>
              </TouchableOpacity>
            </View>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The big peso field every cash sheet asks for. */
export function CashInput(props: TextInputProps & { hasError?: boolean }) {
  const { hasError, style, ...rest } = props;
  return (
    <View style={[styles.cashField, hasError && styles.cashFieldError]}>
      <Text style={styles.peso}>₱</Text>
      <TextInput
        placeholder="0.00"
        placeholderTextColor={colors.textTertiary}
        keyboardType="decimal-pad"
        returnKeyType="done"
        style={[styles.cashInput, style]}
        {...rest}
      />
    </View>
  );
}

/** Tappable preset amounts under a cash field. */
export function AmountChips({ chips, onPick }: {
  chips: readonly { label: string; amount: number }[];
  onPick: (amount: number) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <View style={styles.chips}>
      {chips.map((chip) => (
        <TouchableOpacity
          key={chip.label}
          style={styles.chip}
          onPress={() => onPick(chip.amount)}
          accessibilityRole="button"
          accessibilityLabel={chip.label}
        >
          <Text style={styles.chipText}>{chip.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export const sheetText = StyleSheet.create({
  label: { ...typography.eyebrow, color: colors.textTertiary, marginTop: spacing.md },
  hint: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "92%",
  },
  body: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.sm,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerCopy: { flex: 1, gap: 2 },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  closeHit: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
  close: { ...typography.body, fontWeight: "600", color: colors.textSecondary },
  cashField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 64,
    backgroundColor: colors.background,
  },
  cashFieldError: { borderColor: colors.danger },
  peso: { fontSize: 28, fontWeight: "700", color: colors.textTertiary, marginRight: spacing.sm },
  cashInput: { flex: 1, fontSize: 32, fontWeight: "800", color: colors.textPrimary, paddingVertical: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  chipText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
});

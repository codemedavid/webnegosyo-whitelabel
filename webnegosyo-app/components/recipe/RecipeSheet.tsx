import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Modal } from "../Modal";
import { Icon } from "../Icon";
import { centeredDialog, useCenteredDialog } from "../pos/dialog-layout";
import { colors, typography, spacing, radius } from "../../theme/colors";

interface RecipeSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** A list sheet takes a fixed share of the screen; a short one hugs its content. */
  height?: DimensionValue;
  children: React.ReactNode;
}

/**
 * The bottom sheet both recipe pickers open in. Docked on a phone, centred on
 * a tablet (the register's dialog rule), lifted above the keyboard. The body
 * does not scroll on its own so a sheet can hand the space to a FlatList.
 */
export function RecipeSheet({ visible, title, subtitle, onClose, height, children }: RecipeSheetProps) {
  const insets = useSafeAreaInsets();
  const isCentered = useCenteredDialog();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.backdrop, isCentered && centeredDialog.backdrop]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing.lg },
            height !== undefined && { height },
            isCentered && centeredDialog.sheet,
          ]}
        >
          {!isCentered && <View style={styles.grabber} />}
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,14,8,0.5)" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.lg,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.lg },
  headerCopy: { flex: 1 },
  title: { ...typography.title, fontSize: 22, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
});

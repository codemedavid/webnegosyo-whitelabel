import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { IconButton } from "../IconButton";

interface FloorSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Drawn in the header, right of the title. */
  accessory?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned under the scrolling body — the sheet's primary actions. */
  footer?: React.ReactNode;
}

/**
 * The floor's bottom sheet: one frame for the quick view, seating a party
 * and editing a table, so they open, scroll and dismiss the same way.
 */
export function FloorSheet({ visible, title, subtitle, onClose, accessory, children, footer }: FloorSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity
          style={styles.backdropFill}
          onPress={onClose}
          activeOpacity={1}
          accessibilityLabel={`Dismiss ${title}`}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.copy}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {accessory}
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(29,24,21,0.45)", justifyContent: "flex-end" },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    maxHeight: "88%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.md },
  copy: { flex: 1 },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  body: { flexGrow: 0 },
  bodyContent: { gap: spacing.md, paddingBottom: spacing.sm },
  footer: { gap: spacing.sm, paddingTop: spacing.md },
});

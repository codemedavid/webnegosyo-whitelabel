import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Modal } from "../Modal";
import { IconButton } from "../IconButton";

interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** A plain sheet from the bottom with a title and a close button; tapping the dim ground closes it. */
export function BottomSheet({ visible, title, onClose, children, footer }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
              {title}
            </Text>
            <IconButton icon="close" onPress={onClose} label="Close" />
          </View>
          <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "85%" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  title: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  body: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
});

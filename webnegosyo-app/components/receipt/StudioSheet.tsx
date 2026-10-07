import React, { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Modal } from "../Modal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { IconButton } from "../IconButton";

/**
 * A modal sheet for the editor's pickers: the block library, the templates,
 * paper and style. Rises from the bottom edge over a dimmed studio and closes
 * on the backdrop, the close button or Android's back.
 *
 * The block inspector is deliberately NOT one of these — it is docked, so the
 * paper stays live and tappable above it while the merchant edits.
 */

/** A sheet never covers more than this share of the screen; the studio stays visible. */
const MAX_HEIGHT_RATIO = 0.82;
const RISE_DISTANCE = 48;

interface StudioSheetProps {
  isVisible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function StudioSheet({ isVisible, title, subtitle, onClose, children }: StudioSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const rise = useRef(new Animated.Value(RISE_DISTANCE)).current;

  useEffect(() => {
    if (!isVisible) return;
    rise.setValue(RISE_DISTANCE);
    Animated.spring(rise, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 260, mass: 0.9 }).start();
  }, [isVisible, rise]);

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: height * MAX_HEIGHT_RATIO, paddingBottom: insets.bottom + spacing.md },
            { transform: [{ translateY: rise }] },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(14,11,9,0.55)" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.2, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  scroll: { flexGrow: 0 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
});

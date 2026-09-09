import React, { useEffect, useRef } from "react";
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import type { TutorialChapter } from "../../lib/tutorial/chapters";

/**
 * The moment a chapter ends. A check that springs in, the chapter's name, and
 * three ways on: into the real screen, the next chapter, or back to the list.
 */
interface ChapterCompleteSheetProps {
  visible: boolean;
  chapter: TutorialChapter;
  next: TutorialChapter | null;
  isTourComplete: boolean;
  onOpenDestination: () => void;
  onNextChapter: () => void;
  onBackToChapters: () => void;
}

export function ChapterCompleteSheet({
  visible,
  chapter,
  next,
  isTourComplete,
  onOpenDestination,
  onNextChapter,
  onBackToChapters,
}: ChapterCompleteSheetProps) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) {
      pop.setValue(0);
      return;
    }
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
  }, [visible, pop]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onBackToChapters}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Animated.View style={[styles.badge, { transform: [{ scale }] }]}>
            <Icon name="check" size={30} color={colors.textOnDark} strokeWidth={2.5} />
          </Animated.View>
          <Text style={styles.eyebrow}>{isTourComplete ? "Tour complete" : "Chapter complete"}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {isTourComplete ? "You know the whole app" : chapter.title}
          </Text>
          <Text style={styles.body}>
            {isTourComplete
              ? "Every chapter is done. Replay any of them from Menu whenever you need a refresher."
              : next
                ? `Up next: ${next.title}. ${next.minutes} min.`
                : "That was the last unfinished chapter."}
          </Text>
          <View style={styles.actions}>
            {chapter.destination ? (
              <Button label={chapter.destination.label} onPress={onOpenDestination} size="lg" icon="arrow-right" />
            ) : null}
            {next ? (
              <Button label="Next chapter" tone="secondary" onPress={onNextChapter} size="lg" />
            ) : null}
            <TouchableOpacity onPress={onBackToChapters} style={styles.link} accessibilityRole="button">
              <Text style={styles.linkText}>Back to chapters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(29,24,21,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.lg + 4, padding: spacing.xxl, alignItems: "center", gap: spacing.sm, ...shadow.md },
  badge: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm, ...shadow.md },
  eyebrow: { ...typography.eyebrow, color: colors.success },
  title: { ...typography.title, color: colors.textPrimary, textAlign: "center", letterSpacing: -0.3 },
  body: { ...typography.body, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
  actions: { alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.md },
  link: { alignItems: "center", paddingVertical: spacing.md },
  linkText: { ...typography.body, fontWeight: "600", color: colors.textSecondary },
});

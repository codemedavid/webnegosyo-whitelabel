import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

/**
 * The tour's voice: a small ink card floating over the simulated screen. It
 * says what this step is, what to tap, and — once tapped — what just
 * happened, and carries the only chrome the tour has: progress, close, back
 * and next. It never covers the target: a step whose control sits low on the
 * screen asks for the card at the top.
 */
interface CoachCardProps {
  chapterTitle: string;
  stepIndex: number;
  stepCount: number;
  title: string;
  body: string;
  prompt?: string;
  result?: string;
  tried: boolean;
  isLast: boolean;
  position: "top" | "bottom";
  onBack?: () => void;
  onNext: () => void;
  onClose: () => void;
  onLayoutHeight?: (height: number) => void;
}

export function CoachCard({
  chapterTitle,
  stepIndex,
  stepCount,
  title,
  body,
  prompt,
  result,
  tried,
  isLast,
  position,
  onBack,
  onNext,
  onClose,
  onLayoutHeight,
}: CoachCardProps) {
  const enter = useRef(new Animated.Value(0)).current;
  // Collapsed, the card is one line — the screen underneath is the point, and
  // a merchant who has read the step wants it out of the way. A new step
  // re-opens it.
  const [isCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    setIsCollapsed(false);
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [stepIndex, enter]);
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [position === "bottom" ? 24 : -24, 0] });

  const nextLabel = isLast ? "Finish chapter" : tried ? "Next" : "Skip";

  return (
    <Animated.View
      style={[styles.card, isCollapsed && styles.cardCollapsed, { opacity: enter, transform: [{ translateY }] }]}
      accessibilityLiveRegion="polite"
      onLayout={(e) => onLayoutHeight?.(e.nativeEvent.layout.height)}
    >
      <View style={styles.head}>
        <View style={styles.strip} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: stepCount, now: stepIndex + 1 }}>
          {Array.from({ length: stepCount }, (_, i) => (
            <View key={i} style={[styles.segment, i < stepIndex && styles.segmentDone, i === stepIndex && styles.segmentActive]} />
          ))}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {chapterTitle} · {stepIndex + 1}/{stepCount}
        </Text>
        <TouchableOpacity
          onPress={() => setIsCollapsed((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={isCollapsed ? "Show the step" : "Hide the step"}
          hitSlop={8}
          style={styles.close}
        >
          <Icon name={isCollapsed ? "chevron-down" : "minus"} size={16} color={colors.heroInkMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close chapter" hitSlop={8} style={styles.close}>
          <Icon name="close" size={16} color={colors.heroInkMuted} />
        </TouchableOpacity>
      </View>

      {isCollapsed ? (
        <View style={styles.collapsedRow}>
          <Text style={styles.collapsedTitle} numberOfLines={1}>{tried && result ? result : prompt ?? title}</Text>
          <TouchableOpacity onPress={onNext} accessibilityRole="button" accessibilityLabel={nextLabel} style={[styles.next, styles.nextSmall, !tried && !isLast && styles.nextQuiet]}>
            <Text style={[styles.nextText, !tried && !isLast && styles.nextTextQuiet]}>{nextLabel}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {tried && result ? (
        <View style={styles.result}>
          <View style={styles.resultCheck}>
            <Icon name="check" size={11} color={colors.textOnDark} strokeWidth={3} />
          </View>
          <Text style={styles.resultText}>{result}</Text>
        </View>
      ) : prompt ? (
        <View style={styles.prompt}>
          <View style={styles.promptDot} />
          <Text style={styles.promptText}>{prompt}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Previous step" style={styles.back}>
            <Icon name="chevron-left" size={14} color={colors.heroInkMuted} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <TouchableOpacity
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          style={[styles.next, !tried && !isLast && styles.nextQuiet]}
        >
          <Text style={[styles.nextText, !tried && !isLast && styles.nextTextQuiet]}>{nextLabel}</Text>
          <Icon name={isLast ? "check" : "arrow-right"} size={14} color={tried || isLast ? colors.heroInk : colors.heroInkText} strokeWidth={2.25} />
        </TouchableOpacity>
      </View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.heroInkElevated,
    ...shadow.md,
  },
  cardCollapsed: { paddingVertical: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  collapsedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  collapsedTitle: { ...typography.caption, fontWeight: "700", color: colors.heroInkText, flex: 1 },
  nextSmall: { height: 32, paddingHorizontal: spacing.md },
  strip: { flexDirection: "row", gap: 3, width: 72 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(253,251,247,0.18)" },
  segmentDone: { backgroundColor: colors.success },
  segmentActive: { backgroundColor: colors.tabBarActive },
  meta: { ...typography.small, fontWeight: "700", color: colors.heroInkMuted, flex: 1 },
  close: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  title: { ...typography.body, fontWeight: "800", color: colors.heroInkText, letterSpacing: -0.2 },
  body: { ...typography.caption, color: colors.heroInkMuted, lineHeight: 18 },
  prompt: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.heroInkElevated, borderRadius: radius.sm, padding: spacing.sm },
  promptDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.tabBarActive },
  promptText: { ...typography.caption, fontWeight: "700", color: colors.heroInkText, flex: 1 },
  result: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: "rgba(4,120,87,0.22)", borderRadius: radius.sm, padding: spacing.sm },
  resultCheck: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginTop: 1 },
  resultText: { ...typography.caption, color: colors.heroInkText, flex: 1, lineHeight: 18 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: spacing.sm, paddingRight: spacing.sm },
  backText: { ...typography.caption, fontWeight: "700", color: colors.heroInkMuted },
  next: { flexDirection: "row", alignItems: "center", gap: spacing.xs, height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.full, backgroundColor: colors.tabBarActive },
  nextQuiet: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(253,251,247,0.25)" },
  nextText: { ...typography.caption, fontWeight: "800", color: colors.heroInk },
  nextTextQuiet: { color: colors.heroInkText },
});

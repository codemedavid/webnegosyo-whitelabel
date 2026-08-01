import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface ScreenHeaderProps {
  title: string;
  /** Small uppercase kicker above the title. */
  eyebrow?: string;
  /** One line of context under the title (counts, status). */
  subtitle?: string;
  /** Optional trailing control, e.g. a count chip or icon button. */
  right?: React.ReactNode;
  /** Renders a back affordance instead of the eyebrow. */
  onBack?: () => void;
  backLabel?: string;
  children?: React.ReactNode;
}

/**
 * Ink header block shared by every platform console screen.
 *
 * Owns the top safe-area inset itself: these screens are plain ScrollViews
 * inside a Tabs navigator with `headerShown: false`, so without this the first
 * line of content renders under the status bar / notch.
 */
export function ScreenHeader({
  title,
  eyebrow,
  subtitle,
  right,
  onBack,
  backLabel = "Back",
  children,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
        >
          <Text style={styles.backText}>‹ {backLabel}</Text>
        </TouchableOpacity>
      ) : eyebrow ? (
        <Text style={styles.eyebrow}>{eyebrow}</Text>
      ) : null}

      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.heroInk,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.lg + 8,
    borderBottomRightRadius: radius.lg + 8,
    gap: spacing.xs,
  },
  eyebrow: { ...typography.eyebrow, color: colors.warning },
  backButton: { alignSelf: "flex-start", paddingVertical: 2, paddingRight: spacing.sm },
  backText: { ...typography.caption, color: colors.heroInkMuted, fontWeight: "700" },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  titleBlock: { flex: 1, gap: 2 },
  title: { ...typography.title, fontSize: 28, color: colors.heroInkText },
  subtitle: { ...typography.caption, color: colors.heroInkMuted },
});

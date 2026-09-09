import React, { useEffect, useRef } from "react";
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { useAuthStore } from "../../stores/auth-store";
import { useTutorialStore } from "../../stores/tutorial-store";
import { shouldShowTutorialWelcome } from "../../lib/tutorial/progress";
import { useTutorialChapters, useTutorialProgress } from "../../lib/tutorial/use-tutorial";
import { TUTORIAL_HUB_ROUTE } from "../../lib/tutorial/routes";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";

/**
 * The first-run greeter. Mounted once in the (main) tab layout next to the
 * What's New popup, so a merchant's very first session opens with an offer to
 * learn the app rather than an empty order queue. Shows once per account and
 * goes quiet whether they start the tour or decline it — the hub stays one tap
 * away in the Menu for whenever they are ready.
 */
export function TutorialWelcomePopup() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);
  const impersonatedTenantId = useAuthStore((s) => s.impersonatedTenantId);
  const tenantName = useAuthStore((s) => s.tenantName);
  const dismissWelcome = useTutorialStore((s) => s.dismissWelcome);
  const { progress, isLoaded } = useTutorialProgress();
  const chapters = useTutorialChapters();

  const isEligible =
    isLoaded && shouldShowTutorialWelcome({ isAuthenticated, isSuperadmin, impersonatedTenantId, progress });

  if (!isEligible) return null;

  const minutes = chapters.reduce((sum, c) => sum + c.minutes, 0);

  const start = () => {
    void dismissWelcome();
    router.push(TUTORIAL_HUB_ROUTE);
  };
  const later = () => {
    void dismissWelcome();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={later}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.hero}>
            <Orbit />
            <View style={styles.heroBadge}>
              <Icon name="check" size={22} color={colors.textOnDark} strokeWidth={2.25} />
            </View>
          </View>
          <View style={styles.body}>
            <Text style={styles.eyebrow}>Welcome aboard</Text>
            <Text style={styles.title} accessibilityRole="header">
              {tenantName ? `${tenantName} is live` : "Your store is live"}
            </Text>
            <Text style={styles.summary}>
              Learn the whole app in about {minutes} minutes. One short chapter per screen,
              with examples you can tap to see exactly what happens.
            </Text>
            <View style={styles.perks}>
              <Perk text={`${chapters.length} chapters, each under 3 minutes`} />
              <Perk text="Try every action safely, nothing real changes" />
              <Perk text="Pick it up any time from the Menu" />
            </View>
            <View style={styles.actions}>
              <Button label="Start the tour" onPress={start} size="lg" icon="arrow-right" />
              <TouchableOpacity onPress={later} accessibilityRole="button" style={styles.later}>
                <Text style={styles.laterText}>I&apos;ll explore on my own</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Perk({ text }: { text: string }) {
  return (
    <View style={styles.perk}>
      <View style={styles.perkDot} />
      <Text style={styles.perkText}>{text}</Text>
    </View>
  );
}

/** Slow concentric rings behind the badge, so the ink hero is not a flat block. */
function Orbit() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={[styles.orbit, { transform: [{ rotate }] }]} pointerEvents="none">
      <Svg width={220} height={220} viewBox="0 0 220 220">
        <Circle cx={110} cy={110} r={100} stroke="rgba(253,251,247,0.10)" strokeWidth={1} fill="none" />
        <Circle cx={110} cy={110} r={72} stroke="rgba(253,251,247,0.14)" strokeWidth={1} fill="none" strokeDasharray="6 10" />
        <Circle cx={110} cy={110} r={46} stroke="rgba(245,158,11,0.35)" strokeWidth={1.5} fill="none" strokeDasharray="40 250" />
        <Circle cx={182} cy={110} r={4} fill={colors.tabBarActive} />
        <Circle cx={110} cy={38} r={3} fill={colors.accent} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(29,24,21,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.lg + 4,
    overflow: "hidden",
    ...shadow.md,
  },
  hero: {
    height: 168,
    backgroundColor: colors.heroInk,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  orbit: { position: "absolute" },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  body: { padding: spacing.xxl, gap: spacing.sm },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.title, color: colors.textPrimary, letterSpacing: -0.3 },
  summary: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  perks: { gap: spacing.sm, marginTop: spacing.xs },
  perk: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  perkDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.tabBarActive },
  perkText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  actions: { marginTop: spacing.md, gap: spacing.xs },
  later: { alignItems: "center", paddingVertical: spacing.md },
  laterText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
});

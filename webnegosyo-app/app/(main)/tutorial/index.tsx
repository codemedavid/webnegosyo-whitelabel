import React from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { BackHeader } from "../../../components/BackHeader";
import { Icon } from "../../../components/Icon";
import { SectionHeader } from "../../../components/SectionHeader";
import { TutorialProgressRing } from "../../../components/tutorial/TutorialProgressRing";
import { useAuthStore } from "../../../stores/auth-store";
import { useTutorialStore } from "../../../stores/tutorial-store";
import { useTutorialChapters, useTutorialProgress } from "../../../lib/tutorial/use-tutorial";
import { nextChapter, progressSummary } from "../../../lib/tutorial/progress";
import { tutorialChapterRoute } from "../../../lib/tutorial/routes";
import type { TutorialChapter } from "../../../lib/tutorial/chapters";

/**
 * The tutorial hub: every chapter this account is offered, what is done, and
 * one button that resumes where they left off. Reached from the first-run
 * greeter, the Menu hub's Tools, and Account, so it is never more than two
 * taps away once the greeter has gone.
 */
export default function TutorialHubScreen() {
  const isDemo = useAuthStore((s) => s.isDemo);
  const chapters = useTutorialChapters();
  const { progress } = useTutorialProgress();
  const reset = useTutorialStore((s) => s.reset);

  const ids = chapters.map((c) => c.id);
  const summary = progressSummary(progress, ids);
  const resumeId = nextChapter(progress, ids);
  const resume = resumeId ? chapters.find((c) => c.id === resumeId) : undefined;
  const minutesLeft = chapters
    .filter((c) => !progress.completedChapterIds.includes(c.id))
    .reduce((sum, c) => sum + c.minutes, 0);
  const totalMinutes = chapters.reduce((sum, c) => sum + c.minutes, 0);

  const open = (chapter: TutorialChapter) => router.push(tutorialChapterRoute(chapter.id));

  const confirmReset = () => {
    Alert.alert("Start the tour over?", "Every chapter will be marked unfinished. Nothing in your store changes.", [
      { text: "Keep progress", style: "cancel" },
      { text: "Start over", style: "destructive", onPress: () => void reset() },
    ]);
  };

  return (
    <View style={styles.screen}>
      <BackHeader title="Learn the app" subtitle={`${chapters.length} chapters · about ${totalMinutes} min`} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <TutorialProgressRing fraction={summary.fraction} completed={summary.completed} total={summary.total} />
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>{summary.isComplete ? "Tour complete" : summary.completed === 0 ? "Ready when you are" : "Keep going"}</Text>
            <Text style={styles.heroTitle}>
              {summary.isComplete
                ? "You know the whole app"
                : resume
                  ? `Next: ${resume.title}`
                  : "Start with Getting around"}
            </Text>
            <Text style={styles.heroHint}>
              {summary.isComplete ? "Replay any chapter below whenever you like." : `About ${minutesLeft} min left`}
            </Text>
            {resume ? (
              <TouchableOpacity
                style={styles.continueButton}
                onPress={() => open(resume)}
                accessibilityRole="button"
                accessibilityLabel={summary.completed === 0 ? "Start the tour" : "Continue"}
              >
                <Text style={styles.continueText}>{summary.completed === 0 ? "Start the tour" : "Continue"}</Text>
                <Icon name="arrow-right" size={16} color={colors.heroInk} strokeWidth={2.25} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {isDemo ? (
          <View style={styles.note}>
            <Icon name="info" size={16} color={colors.textSecondary} />
            <Text style={styles.noteText}>
              In the demo store, real actions show a &quot;Demo mode&quot; notice. Everything in these chapters can be tried safely here.
            </Text>
          </View>
        ) : null}

        <SectionHeader title="Chapters" />
        <View style={styles.list}>
          {chapters.map((chapter, index) => {
            const isDone = progress.completedChapterIds.includes(chapter.id);
            const isNext = chapter.id === resumeId;
            return (
              <TouchableOpacity
                key={chapter.id}
                style={[styles.row, index < chapters.length - 1 && styles.rowGrouped]}
                onPress={() => open(chapter)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${chapter.title}${isDone ? ", complete" : ""}`}
                accessibilityHint={chapter.tagline}
              >
                <View style={[styles.tile, isDone && styles.tileDone, isNext && styles.tileNext]}>
                  {isDone ? (
                    <Icon name="check" size={18} color={colors.textOnDark} strokeWidth={2.5} />
                  ) : (
                    <Icon name={chapter.icon} size={18} color={isNext ? colors.textOnDark : colors.textPrimary} />
                  )}
                </View>
                <View style={styles.rowCopy}>
                  <View style={styles.rowTitleLine}>
                    <Text style={styles.rowIndex}>{String(index + 1).padStart(2, "0")}</Text>
                    <Text style={[styles.rowTitle, isDone && styles.rowTitleDone]} numberOfLines={1}>
                      {chapter.title}
                    </Text>
                  </View>
                  <Text style={styles.rowTagline} numberOfLines={2}>{chapter.tagline}</Text>
                  <Text style={styles.rowMeta}>
                    {chapter.steps.length} steps · {chapter.minutes} min{isNext ? " · Up next" : ""}
                  </Text>
                </View>
                <Icon name="chevron" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            );
          })}
        </View>

        {summary.completed > 0 ? (
          <TouchableOpacity onPress={confirmReset} style={styles.resetLink} accessibilityRole="button" accessibilityLabel="Start the tour over">
            <Text style={styles.resetText}>Start the tour over</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl * 2 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadow.md,
  },
  heroCopy: { flex: 1, gap: 2 },
  heroEyebrow: { ...typography.eyebrow, color: colors.tabBarActive },
  heroTitle: { ...typography.heading, color: colors.heroInkText, letterSpacing: -0.2 },
  heroHint: { ...typography.caption, color: colors.heroInkMuted },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.tabBarActive,
    marginTop: spacing.sm,
  },
  continueText: { ...typography.body, fontWeight: "800", color: colors.heroInk },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noteText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  rowGrouped: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  tileDone: { backgroundColor: colors.success },
  tileNext: { backgroundColor: colors.primary },
  rowCopy: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  rowIndex: { ...typography.small, fontWeight: "800", color: colors.textTertiary, fontVariant: ["tabular-nums"] },
  rowTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  rowTitleDone: { color: colors.textSecondary },
  rowTagline: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  rowMeta: { ...typography.small, color: colors.textTertiary, fontWeight: "600" },
  resetLink: { alignItems: "center", paddingVertical: spacing.xl },
  resetText: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
});

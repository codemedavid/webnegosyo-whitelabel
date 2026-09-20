import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../../theme/colors";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { ChapterCompleteSheet } from "../../../components/tutorial/ChapterCompleteSheet";
import { CoachCard } from "../../../components/tutorial/CoachCard";
import { SpotlightOverlay, SpotlightProvider, useSpotlightFrame } from "../../../components/tutorial/spotlight";
import { TUTORIAL_SCENES } from "../../../components/tutorial/scenes";
import { useMockTabBarHeight } from "../../../components/tutorial/scenes/shared";
import { getChapter, type CoachPosition } from "../../../lib/tutorial/chapters";
import { clampStepIndex } from "../../../lib/tutorial/player";
import { nextChapter, progressSummary } from "../../../lib/tutorial/progress";
import { TUTORIAL_HUB_ROUTE, tutorialChapterRoute } from "../../../lib/tutorial/routes";
import { useTutorialChapters, useTutorialProgress } from "../../../lib/tutorial/use-tutorial";
import { goTo, type TabAwareRouter } from "../../../lib/tab-navigation";
import { useTutorialStore } from "../../../stores/tutorial-store";

/**
 * The chapter player: the real screen, simulated full-screen with the mock
 * store's data, dimmed everywhere except the one control this step is about.
 * A small coach card floats over it with the words; the merchant taps the
 * screen itself. Doing the step lifts the dim so the "after" state is seen
 * whole. The real tab bar is hidden under this route — the scene draws one.
 */
export default function TutorialChapterScreen() {
  const { chapterId } = useLocalSearchParams<{ chapterId: string }>();
  const chapter = useMemo(() => (chapterId ? getChapter(chapterId) : undefined), [chapterId]);
  const chapters = useTutorialChapters();
  const { progress } = useTutorialProgress();
  const openChapter = useTutorialStore((s) => s.openChapter);
  const completeChapter = useTutorialStore((s) => s.completeChapter);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useMockTabBarHeight();
  const { height: windowHeight } = useWindowDimensions();
  const [coachHeight, setCoachHeight] = useState(0);

  const [rawStepIndex, setStepIndex] = useState(0);
  const [triedSteps, setTriedSteps] = useState<Record<string, boolean>>({});
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    if (chapter) void openChapter(chapter.id);
  }, [chapter, openChapter]);

  // Tab screens mount once and stay mounted, so every visit — and every
  // chapter change while the screen is already up — starts at step one.
  const restart = useCallback(() => {
    setStepIndex(0);
    setTriedSteps({});
    setIsFinished(false);
  }, []);
  useFocusEffect(restart);
  // The reset has to happen in the render that first sees the new chapter, not
  // in an effect after it: opening a three-step chapter while step five of the
  // last one is still in state would render `chapter.steps[4]` — undefined —
  // and crash before the effect could run.
  const [playedChapterId, setPlayedChapterId] = useState(chapterId);
  if (chapterId !== playedChapterId) {
    setPlayedChapterId(chapterId);
    restart();
  }

  const tabRouter = router as TabAwareRouter<`/(main)/${string}`>;

  if (!chapter) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState message="This chapter no longer exists." />
        <Button label="Back to chapters" tone="secondary" onPress={() => goTo(tabRouter, TUTORIAL_HUB_ROUTE)} style={styles.centered} />
      </View>
    );
  }

  // Clamped as well, so an edited chapter or a hot reload cannot index past it.
  const stepIndex = clampStepIndex(chapter.steps.length, rawStepIndex);
  const step = chapter.steps[stepIndex];
  const isLast = stepIndex === chapter.steps.length - 1;
  const tried = !!triedSteps[step.id];
  const Scene = TUTORIAL_SCENES[step.scene.kind];

  const markTried = () => setTriedSteps((prev) => (prev[step.id] ? prev : { ...prev, [step.id]: true }));
  const finish = () => {
    void completeChapter(chapter.id);
    setIsFinished(true);
  };
  const advance = () => (isLast ? finish() : setStepIndex((i) => i + 1));
  const back = () => setStepIndex((i) => Math.max(0, i - 1));

  const ids = chapters.map((c) => c.id);
  const afterThis = { ...progress, completedChapterIds: [...progress.completedChapterIds, chapter.id], lastChapterId: chapter.id };
  const nextId = nextChapter(afterThis, ids);
  const next = nextId ? chapters.find((c) => c.id === nextId) ?? null : null;
  const isTourComplete = progressSummary(afterThis, ids).isComplete;

  // Every destination is a sibling in the tab navigator, so it is reached by
  // navigate, never replace — see lib/tab-navigation.ts for the crash.
  const openDestination = () => {
    const destination = chapter.destination;
    setIsFinished(false);
    if (!destination) return goTo(tabRouter, TUTORIAL_HUB_ROUTE);
    goTo(tabRouter, destination.href as `/(main)/${string}`);
  };
  const openNext = () => {
    setIsFinished(false);
    if (next) goTo(tabRouter, tutorialChapterRoute(next.id));
  };
  const backToChapters = () => {
    setIsFinished(false);
    goTo(tabRouter, TUTORIAL_HUB_ROUTE);
  };

  return (
    <SpotlightProvider>
      <View style={styles.screen}>
        {Scene ? <Scene key={step.id} phase={step.scene.phase} tried={tried} onTried={markTried} /> : null}
        <SpotlightOverlay visible={!tried} clampBottom={windowHeight - tabBarHeight} />
        <CoachDock preferred={step.coach} tabBarHeight={tabBarHeight} cardHeight={coachHeight}>
          <CoachCard
            chapterTitle={chapter.title}
            stepIndex={stepIndex}
            stepCount={chapter.steps.length}
            title={step.title}
            body={step.body}
            prompt={step.prompt}
            result={step.result}
            tried={tried}
            isLast={isLast}
            position={step.coach}
            onBack={stepIndex > 0 ? back : undefined}
            onNext={advance}
            onClose={() => goTo(tabRouter, TUTORIAL_HUB_ROUTE)}
            onLayoutHeight={setCoachHeight}
          />
        </CoachDock>
      </View>
      <ChapterCompleteSheet
        visible={isFinished}
        chapter={chapter}
        next={next}
        isTourComplete={isTourComplete}
        onOpenDestination={openDestination}
        onNextChapter={openNext}
        onBackToChapters={backToChapters}
      />
    </SpotlightProvider>
  );
}

/**
 * Floats the coach card at its preferred edge, and moves it to the other
 * edge whenever the spotlit target would sit underneath it — a card that
 * covers the control it is asking for teaches nothing.
 */
function CoachDock({
  preferred,
  tabBarHeight,
  cardHeight,
  children,
}: {
  preferred: CoachPosition;
  tabBarHeight: number;
  cardHeight: number;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const frame = useSpotlightFrame();
  const gap = spacing.md;
  const topEdge = insets.top + spacing.sm;
  const bottomEdge = tabBarHeight + gap;
  const coversAtTop = !!frame && frame.y < topEdge + cardHeight + gap;
  const coversAtBottom = !!frame && frame.y + frame.height > windowHeight - bottomEdge - cardHeight - gap && frame.y < windowHeight - tabBarHeight;
  let position: CoachPosition = preferred;
  if (preferred === "bottom" && coversAtBottom && !coversAtTop) position = "top";
  if (preferred === "top" && coversAtTop && !coversAtBottom) position = "bottom";
  const style = position === "top" ? { top: topEdge } : { bottom: bottomEdge };
  return (
    <View style={[styles.coach, style]} pointerEvents="box-none">
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { alignSelf: "center" },
  coach: { position: "absolute", left: spacing.md, right: spacing.md },
});

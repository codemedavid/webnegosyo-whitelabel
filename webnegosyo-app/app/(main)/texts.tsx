import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { colors, spacing } from "../../theme/colors";
import { automationHref } from "../../lib/navigation";
import { goTo, type TabAwareRouter } from "../../lib/tab-navigation";
import { isTabReachable } from "../../lib/tab-visibility";
import { useTabVisibilityContext } from "../../lib/use-tab-visibility-context";
import { useRefetchOnScreenFocus } from "../../lib/query/use-screen-focus";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { useAutomationsView } from "../../lib/sms-automations/use-automations";
import { senderLine, type Blocker } from "../../lib/sms-automations/view";
import type { RecipeId, TextingRules } from "../../lib/sms-automations/api";
import { useNowMs } from "../../lib/use-now-ms";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { SenderStrip } from "../../components/texts/SenderStrip";
import { AutomationsPanel } from "../../components/texts/AutomationsPanel";
import { ActivityPanel } from "../../components/texts/ActivityPanel";
import { RulesPanel } from "../../components/texts/RulesPanel";
import { TurnOnSheet } from "../../components/texts/TurnOnSheet";
import { useAutomationSwitch } from "../../components/texts/use-automation-switch";

type TextsTab = "automations" | "activity" | "rules";

const TABS: readonly { label: string; value: TextsTab }[] = [
  { label: "Automations", value: "automations" },
  { label: "Activity", value: "activity" },
  { label: "Rules", value: "rules" },
];
const STALE_MS = 30_000;

function isTextsTab(value: unknown): value is TextsTab {
  return value === "automations" || value === "activity" || value === "rules";
}

/**
 * Texts: the automatic SMS that bring guests back.
 *
 * Opens on the automations — each a sentence with its switch — because "is it
 * on, and is it doing anything?" is the question that brings an owner here.
 * Above them, one strip says whether the phone that sends them can send right
 * now. Activity is every text and what became of it; Rules are the store-wide
 * limits and the sending phone.
 */
export default function TextsScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const ctx = useTabVisibilityContext();
  const isAllowed = isTabReachable("texts", ctx);
  const params = useLocalSearchParams<{ tab?: string; resume?: string }>();
  // Set while the owner is adding the review link a review request waits for.
  const [isResumingReview, setIsResumingReview] = useState(false);
  const [tab, setTab] = useState<TextsTab>("automations");
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Bumped by pull-to-refresh only: the activity feed starts over on it.
  const [activityRefresh, setActivityRefresh] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const phoneSectionY = useRef<number | null>(null);
  const now = useNowMs();

  const query = useAutomationsView(tenantId, isAllowed);
  const { data: view, refetch, invalidate, isRefetching, dataUpdatedAt } = query;

  useRefetchOnScreenFocus({ enabled: isAllowed && tenantId !== null, staleMs: STALE_MS, dataUpdatedAt, isFetching: isRefetching, refetch });

  // A door that names a tab (the editor's "Add your review link") opens it once.
  useEffect(() => {
    if (!isTextsTab(params.tab)) return;
    setTab(params.tab);
    if (params.resume === "review_request") setIsResumingReview(true);
    router.setParams({ tab: undefined, resume: undefined });
  }, [params.tab, params.resume]);

  const onFix = useCallback((blocker: Blocker) => {
    if (blocker.kind === "review_link") {
      setTab("rules");
      setIsResumingReview(true);
    } else goTo(router as TabAwareRouter<`/(main)/${string}`>, "/(main)/loyalty");
  }, []);
  const onChanged = useCallback(() => void invalidate(), [invalidate]);
  // The link was the one thing in the way: offer the way back to the text it unblocks.
  const onRulesSaved = (settings: TextingRules) => {
    void invalidate();
    if (!isResumingReview || !settings.reviewUrl) return;
    setIsResumingReview(false);
    Alert.alert("Review link saved", "Your review request text can start now.", [
      { text: "Later", style: "cancel" },
      { text: "Open review request", onPress: () => router.push(automationHref("review_request")) },
    ]);
  };
  const flow = useAutomationSwitch({ tenantId, view, onChanged, onFix });

  const openEditor = (recipe: RecipeId) => router.push(automationHref(recipe));
  const showPhone = () => {
    setTab("rules");
    // The section lays out after the tab switch; scroll once it is measured.
    setTimeout(() => {
      if (phoneSectionY.current !== null) scrollRef.current?.scrollTo({ y: phoneSectionY.current, animated: true });
    }, 50);
  };

  const body = (() => {
    if (!isAllowed) {
      return (
        <EmptyState
          icon="message"
          title="Texts aren’t available on this account"
          message="Automatic texts reach every guest of the store, so they are for the owner or staff with guest-list access."
        />
      );
    }
    if (!view) {
      if (query.error) return <ErrorState title="Couldn’t load your texts" message={query.error} onRetry={() => void refetch()} />;
      return <LoadingState message="Loading your texts…" />;
    }
    const sender = senderLine(view, now);
    return (
      <>
        <SenderStrip tone={sender.tone} text={sender.text} onPress={showPhone} />
        <View style={styles.panel}>
          {tab === "automations" ? (
            <AutomationsPanel
              view={view}
              busyId={flow.busyId}
              onOpen={openEditor}
              onTurnOn={flow.turnOn}
              onTurnOff={flow.turnOff}
            />
          ) : null}
          {tab === "activity" ? (
            <ActivityPanel
              tenantId={tenantId}
              waiting={view.outlook.waiting}
              isActive={tab === "activity"}
              refreshKey={activityRefresh}
              onChanged={onChanged}
            />
          ) : null}
          {tab === "rules" ? (
            <RulesPanel
              tenantId={tenantId}
              view={view}
              onSaved={onRulesSaved}
              onPhoneSectionLayout={(y) => {
                phoneSectionY.current = y;
              }}
            />
          ) : null}
        </View>
        <TurnOnSheet view={view} {...flow.sheetProps} />
      </>
    );
  })();

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Texts" subtitle="Automatic texts to your guests">
        {isAllowed ? <SegmentedControl options={TABS} value={tab} onChange={setTab} accessibilityPrefix="Show" /> : null}
      </ScreenHeader>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setActivityRefresh((n) => n + 1);
              void refreshWithMinSpinner([refetch], setIsRefreshing);
            }}
            tintColor={colors.primary}
          />
        }
      >
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl * 3 },
  panel: { marginTop: spacing.lg },
});

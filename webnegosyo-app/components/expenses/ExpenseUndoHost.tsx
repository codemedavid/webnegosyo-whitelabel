import React, { useState } from "react";
import { Alert, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UNDO_WINDOW_MS, useExpenseUndo } from "../../stores/expense-undo-store";
import { spacing } from "../../theme/colors";
import { UndoBar } from "../UndoBar";

/** The tab bar's rows above the home indicator (app/(main)/_layout.tsx TAB_BAR_CONTENT_HEIGHT). */
export const TAB_BAR_CONTENT_HEIGHT = 56;
/**
 * (main) screens registered with `tabBarStyle: { display: "none" }` in
 * app/(main)/_layout.tsx (pinned by ExpenseUndoHost.test.tsx). On them the
 * bar sits on the home indicator, not 56pt above a bar that is not there.
 */
export const ROUTES_WITHOUT_TAB_BAR: readonly string[] = ["end-shift", "pos-loyalty", "receipt-editor", "tutorial/[chapterId]"];

/** The route under (main), as the layout names it: ["(main)", "tutorial", "[chapterId]"] → "tutorial/[chapterId]". */
function routeName(segments: readonly string[]): string {
  return segments.filter((segment) => !(segment.startsWith("(") && segment.endsWith(")"))).join("/");
}

const NO_SEGMENTS: readonly string[] = [];

/**
 * expo-router's `useSegments`, resolved once and lazily: the host is also
 * rendered by component tests that run without a router (its native half is
 * absent under Jest), where the bar keeps its tab-bar position.
 */
const useRouteSegments: () => readonly string[] = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const router = require("expo-router") as { useSegments?: () => string[] };
    return typeof router.useSegments === "function" ? router.useSegments : () => NO_SEGMENTS;
  } catch {
    return () => NO_SEGMENTS;
  }
})();

type Push = (href: string) => void;

/** expo-router's `router.push`, resolved lazily for the same reason as `useRouteSegments`. */
const pushRoute: Push = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const router = require("expo-router") as { router?: { push?: (href: never) => void } };
    const push = router.router?.push;
    return typeof push === "function" ? (href: string) => push(href as never) : () => undefined;
  } catch {
    return () => undefined;
  }
})();

/** How far above the screen's bottom edge the bar docks. */
export function undoBarBottom(segments: readonly string[], insetBottom: number): number {
  const homeIndicator = Math.max(insetBottom, spacing.sm);
  const hasTabBar = !ROUTES_WITHOUT_TAB_BAR.includes(routeName(segments));
  return (hasTabBar ? TAB_BAR_CONTENT_HEIGHT : 0) + homeIndicator + spacing.sm;
}
/** Above any stacked layer on the screen (floating "Add expense" pill, Owl launcher). */
const HOST_Z_INDEX = 20;

/**
 * "Saved · LPG ₱1,050 · Undo" for the newest expense still in its window
 * (`stores/expense-undo-store.ts`). Renders nothing when there is none.
 *
 * The store owns the timer; this bar only counts and offers Undo, so two bars
 * (the sheet's own while it is open, and the host's under it) never send or
 * undo anything twice.
 */
export function ExpenseUndoBar({ style, onNavigate = pushRoute }: { style?: StyleProp<ViewStyle>; onNavigate?: Push }) {
  const current = useExpenseUndo((state) => state.current);
  const commit = useExpenseUndo((state) => state.commit);
  const undo = useExpenseUndo((state) => state.undo);
  // The entry whose offer was taken: its button goes, Undo and the countdown stay.
  const [tookOfferFor, setTookOfferFor] = useState<string | null>(null);
  if (!current) return null;
  const offer = current.offer && tookOfferFor !== current.id ? current.offer : null;

  const onUndo = async () => {
    const outcome = await undo(current.id);
    if (outcome?.status === "error") Alert.alert("Could not undo", outcome.message);
  };

  return (
    <View style={style} pointerEvents="box-none" testID="expense-undo-bar">
      <UndoBar
        key={current.id}
        message={offer ? offer.message : current.message}
        durationMs={UNDO_WINDOW_MS}
        onUndo={() => void onUndo()}
        onCommit={() => commit(current.id)}
        secondaryAction={
          offer
            ? {
                label: offer.label,
                onPress: () => {
                  setTookOfferFor(current.id);
                  onNavigate(offer.href);
                },
              }
            : null
        }
      />
    </View>
  );
}

/**
 * Mounted once in the (main) layout beside `ExpenseSync`: the undo bar for a
 * save, docked above the tab bar on whatever screen the sheet closed onto —
 * or on the home indicator where that screen hides the tab bar.
 */
export function ExpenseUndoHost() {
  const insets = useSafeAreaInsets();
  const segments = useRouteSegments();
  const bottom = undoBarBottom(segments, insets.bottom);
  return <ExpenseUndoBar style={[styles.host, { bottom }]} />;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: HOST_Z_INDEX,
    elevation: HOST_Z_INDEX,
  },
});

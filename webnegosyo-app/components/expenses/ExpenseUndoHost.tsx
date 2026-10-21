import React from "react";
import { Alert, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UNDO_WINDOW_MS, useExpenseUndo } from "../../stores/expense-undo-store";
import { spacing } from "../../theme/colors";
import { UndoBar } from "../UndoBar";

/** The tab bar's rows above the home indicator (app/(main)/_layout.tsx TAB_BAR_CONTENT_HEIGHT). */
const TAB_BAR_CONTENT_HEIGHT = 56;
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
export function ExpenseUndoBar({ style }: { style?: StyleProp<ViewStyle> }) {
  const current = useExpenseUndo((state) => state.current);
  const commit = useExpenseUndo((state) => state.commit);
  const undo = useExpenseUndo((state) => state.undo);
  if (!current) return null;

  const onUndo = async () => {
    const outcome = await undo(current.id);
    if (outcome?.status === "error") Alert.alert("Could not undo", outcome.message);
  };

  return (
    <View style={style} pointerEvents="box-none" testID="expense-undo-bar">
      <UndoBar
        key={current.id}
        message={current.message}
        durationMs={UNDO_WINDOW_MS}
        onUndo={() => void onUndo()}
        onCommit={() => commit(current.id)}
      />
    </View>
  );
}

/**
 * Mounted once in the (main) layout beside `ExpenseSync`: the undo bar for a
 * save, docked above the tab bar on whatever screen the sheet closed onto.
 */
export function ExpenseUndoHost() {
  const insets = useSafeAreaInsets();
  const bottom = TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, spacing.sm) + spacing.sm;
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

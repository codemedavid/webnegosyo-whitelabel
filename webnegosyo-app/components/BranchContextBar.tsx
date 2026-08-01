// Which branch the merchant is working in, on every screen that can be
// narrowed by one. Mounted once in app/(main)/_layout.tsx beside the
// impersonation banner, so no screen can forget it — the failure it prevents is
// an owner reading one branch's takings as the whole store's.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { router } from "expo-router";

import { colors, typography, spacing } from "../theme/colors";
import { canChooseBranch } from "../lib/branch-context";
import { useAccountBranchScope } from "../lib/use-branch-scope";
import { useAuthStore } from "../stores/auth-store";
import { useBranchContextStore } from "../stores/branch-context-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { goTo, type TabAwareRouter } from "../lib/tab-navigation";

export function BranchContextBar() {
  const accountScope = useAccountBranchScope();
  const selectedOutletName = useBranchContextStore((s) => s.selectedOutletName);
  const clearBranch = useBranchContextStore((s) => s.clearBranch);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  // A branch account's own branch, which it cannot leave.
  const accountOutletName = useAuthStore((s) => s.outletName);

  const isOwnerViewing = canChooseBranch(accountScope) && selectedOutletName !== null;
  const isConfined = !canChooseBranch(accountScope);

  // Nothing to say on a single-location store, or to an owner looking at the
  // whole store: the absence of the bar is what "everything" looks like.
  if (!isOwnerViewing && !(isConfined && accountOutletName)) return null;

  const exit = () => {
    clearBranch();
    setWorkspace("business");
    goTo(router as TabAwareRouter<`/(main)/${string}`>, "/(main)/portfolio");
  };

  if (isConfined) {
    // A label, not a control. Offering a switch that cannot change anything
    // would read as a broken button rather than as a restriction.
    return (
      <View style={styles.bar} accessibilityRole="header">
        <Text style={styles.label} numberOfLines={1}>
          {accountOutletName}
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.bar}
      onPress={exit}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Viewing ${selectedOutletName}. Back to all branches`}
    >
      <Text style={styles.back}>‹</Text>
      <Text style={styles.label} numberOfLines={1}>
        {selectedOutletName}
      </Text>
      <Text style={styles.hint}>All branches</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  back: { fontSize: 18, color: colors.textSecondary },
  label: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, flexShrink: 1 },
  hint: { ...typography.small, color: colors.textSecondary, marginLeft: "auto" },
});

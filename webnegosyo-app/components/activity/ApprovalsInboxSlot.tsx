import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { OWL_IMAGE } from "./owl-image";
import { colors, spacing, typography } from "../../theme/colors";


export interface ApprovalsInboxSlotProps {
  tenantId: string | null;
  /**
   * Phase 3 reports how many requests wait, so the Activity screen can open
   * on "To review" while anything is pending (spec §3.1).
   */
  onPendingCountChange?: (count: number) => void;
}

/**
 * The "To review" tab's content. A placeholder slot: Phase 3 (approvals)
 * replaces this component with the real inbox, keeping the export name and
 * props, so app/(main)/activity.tsx needs no change. Shown to approvers only.
 */
export function ApprovalsInboxSlot({ tenantId }: ApprovalsInboxSlotProps) {
  if (!tenantId) return null;
  return (
    <View style={styles.wrap}>
      <Image source={OWL_IMAGE} alt="" style={styles.owl} accessible={false} accessibilityIgnoresInvertColors />
      <Text style={styles.title}>{"Nothing waiting. Your team's all set."}</Text>
      <Text style={styles.text}>
        When someone asks for a refund, cancel, big discount or write-off, it lands here and on your phone.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.xs },
  owl: { width: 72, height: 72, marginBottom: spacing.sm },
  title: { ...typography.heading, color: colors.textPrimary, textAlign: "center" },
  text: { ...typography.body, color: colors.textMuted, textAlign: "center", maxWidth: 300 },
});

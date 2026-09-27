import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing } from "../../theme/colors";
import { Icon } from "../Icon";
import type { StudioNotice } from "../../hooks/useReceiptStudio";
import { studio } from "./studio-theme";

/**
 * One line of feedback floating above the bottom bar — "Removed Tracking QR ·
 * Undo". It never blocks the paper and never asks to be dismissed; it carries
 * the one action that makes the change safe to have made, then goes.
 */
interface StudioNoticeBarProps {
  notice: StudioNotice | null;
  onDismiss: () => void;
}

const ICONS = { success: "check", error: "warning", neutral: null } as const;

export function StudioNoticeBar({ notice, onDismiss }: StudioNoticeBarProps) {
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!notice) return;
    lift.setValue(0);
    Animated.spring(lift, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 240 }).start();
  }, [notice, lift]);

  if (!notice) return null;
  const icon = ICONS[notice.tone];
  const iconColor = notice.tone === "success" ? studio.live : colors.warning;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          opacity: lift,
          transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      <View style={styles.bar} accessibilityLiveRegion="polite" accessibilityRole="alert">
        {icon ? <Icon name={icon} size={17} color={iconColor} strokeWidth={2.25} /> : null}
        <Text style={styles.message} numberOfLines={2} onPress={onDismiss}>
          {notice.message}
        </Text>
        {notice.action ? (
          <TouchableOpacity
            onPress={() => {
              notice.action?.onPress();
              onDismiss();
            }}
            hitSlop={10}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={notice.action.label}
          >
            <Text style={styles.actionText}>{notice.action.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.md },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 50,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  message: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary, paddingVertical: spacing.sm },
  action: { paddingHorizontal: spacing.md, height: 36, justifyContent: "center", borderRadius: radius.sm },
  actionText: { fontSize: 14, fontWeight: "800", color: colors.accent },
});

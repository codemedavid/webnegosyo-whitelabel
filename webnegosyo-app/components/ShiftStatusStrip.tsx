import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { loadOpenShift, type ShiftRecord } from "../lib/shift-service";
import { describeShiftStatus } from "../lib/shift-status";
import { useAuthStore } from "../stores/auth-store";
import { colors, radius, shadow, spacing, typography } from "../theme/colors";
import { Icon } from "./Icon";

/** How often the "3h 12m" on an open shift is re-read from the clock. */
const TICK_MS = 60_000;

/**
 * Home's answer to "is my drawer open, and since when?".
 *
 * The shift itself is still opened and closed on the Drawer screen, where the
 * money is counted — this only reports it, and is the door to that screen.
 * The wording lives in lib/shift-status.ts so Home and the Drawer can never
 * describe the same shift differently.
 */
export function ShiftStatusStrip({ onPress }: { onPress: () => void }) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);

  const [shift, setShift] = useState<ShiftRecord | null>(null);
  const [checked, setChecked] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Re-read on focus: the shift is opened and closed on another screen, so
  // coming back to Home is exactly when this line can be out of date.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!tenantId || !userId) {
        setShift(null);
        setChecked(true);
        return;
      }
      void loadOpenShift(tenantId, userId).then((open) => {
        if (!active) return;
        setShift(open);
        setNow(Date.now());
        setChecked(true);
      });
      return () => {
        active = false;
      };
    }, [tenantId, userId]),
  );

  // Only an open shift has anything that ages.
  useEffect(() => {
    if (!shift) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [shift]);

  const view = useMemo(() => describeShiftStatus(shift, now), [shift, now]);

  // Nothing is drawn until the first read lands: flashing "Not clocked in" at
  // someone who is on a shift is worse than a beat of empty space.
  if (!checked) return null;

  return (
    <TouchableOpacity
      style={styles.strip}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${view.title}. ${view.detail}. Open the drawer.`}
    >
      <View style={[styles.dot, view.isOpen ? styles.dotOpen : styles.dotOff]} />
      <View style={styles.text}>
        <Text style={styles.title}>{view.title}</Text>
        <Text style={styles.detail} numberOfLines={1}>
          {view.detail}
        </Text>
      </View>
      <Icon name="chevron" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.sm,
  },
  dot: { width: 10, height: 10, borderRadius: radius.full },
  dotOpen: { backgroundColor: colors.success },
  dotOff: { backgroundColor: colors.textTertiary },
  text: { flex: 1 },
  title: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  detail: { ...typography.caption, color: colors.textSecondary },
});

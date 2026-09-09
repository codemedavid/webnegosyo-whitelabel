import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";

import { useAuthStore } from "../stores/auth-store";
import { subscreensOf } from "../lib/subscreen-links";
import { goTo, type TabAwareRouter } from "../lib/tab-navigation";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { ListRow } from "./ListRow";

/**
 * The doors to a screen's sub-screens.
 *
 * Insights used to spend a tab-bar slot on Trends, the guest list and Rewards,
 * which truncated every label on the bar and asked the merchant to read three
 * tabs to answer one question. They now hang under the screen they belong to,
 * and this is what puts them there: one grouped card of rows at the foot of the
 * parent, filtered to what this account may actually open.
 *
 * Renders nothing when the account may open none of them, so a restricted staff
 * member never meets an empty "More" heading.
 */
export function SubScreenLinks({ parent, title }: { parent: string; title?: string }) {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);

  const links = subscreensOf(parent, { role, isOwner, permissions });
  if (links.length === 0) return null;

  return (
    <View style={styles.section}>
      {title ? <Text style={styles.heading}>{title}</Text> : null}
      <View style={styles.group}>
        {links.map((link, index) => (
          <ListRow
            key={link.tab}
            icon={link.icon}
            title={link.label}
            subtitle={link.hint}
            grouped={index < links.length - 1}
            onPress={() =>
              goTo(router as TabAwareRouter<`/(main)/${string}`>, `/(main)/${link.tab}`)
            }
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  heading: {
    ...typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
});

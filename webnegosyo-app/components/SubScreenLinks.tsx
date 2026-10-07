import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";

import { subscreensOf } from "../lib/subscreen-links";
import { useTabVisibilityContext } from "../lib/use-tab-visibility-context";
import { goTo, type TabAwareRouter } from "../lib/tab-navigation";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { ListRow } from "./ListRow";
import { IconButton } from "./IconButton";
import { Button } from "./Button";

/**
 * The doors to a screen's sub-screens.
 *
 * Seven screens hang under a bar tab instead of taking a slot of their own
 * (lib/subscreen-links.ts). This is what puts the door on the parent, in one
 * of three shapes: `rows` — a grouped card at the foot of a reading screen
 * (Analytics → Trends) — `actions` — icon buttons in the header of a shift
 * screen (Orders → Kitchen, Tables, Schedule), where the merchant needs the door in
 * reach without scrolling — or `pills`, labelled header buttons for a screen
 * whose doors are destinations in their own right (Reports → Guest list,
 * Rewards), where an unlabelled icon would leave the merchant guessing. Both read the same list, filtered to what this
 * account may actually open.
 *
 * Renders nothing when the account may open none of them, so a restricted
 * staff member never meets an empty heading or a bare header slot.
 */
export function SubScreenLinks({
  parent,
  title,
  variant = "rows",
}: {
  parent: string;
  title?: string;
  variant?: "rows" | "actions" | "pills";
}) {
  const ctx = useTabVisibilityContext();
  const links = subscreensOf(parent, ctx);
  if (links.length === 0) return null;

  const open = (href: string) =>
    goTo(router as TabAwareRouter<`/(main)/${string}`>, href as `/(main)/${string}`);

  if (variant === "pills") {
    return (
      <View style={styles.pills}>
        {links.map((link) => (
          <Button
            key={link.tab}
            label={link.label}
            icon={link.icon}
            tone="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => open(link.href)}
          />
        ))}
      </View>
    );
  }

  if (variant === "actions") {
    return (
      <>
        {links.map((link) => (
          <IconButton
            key={link.tab}
            icon={link.icon}
            label={link.label}
            onPress={() => open(link.href)}
          />
        ))}
      </>
    );
  }

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
            onPress={() => open(link.href)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  pills: { flexDirection: "row", gap: spacing.sm },
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

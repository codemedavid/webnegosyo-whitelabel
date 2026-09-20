import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { avatarIndexFor } from "../../lib/sms/avatar";
import { initialsOf } from "../../lib/staff-format";
import { colors, radius, typography } from "../../theme/colors";

/**
 * A person, before you have read their name.
 *
 * Same treatment as the guest rows: the colour lives in the ring, not in a
 * filled circle, so the initials are always ink on near-white whichever
 * palette slot the account lands in. The slot comes from the account id, so
 * Ana is the same colour on the roster, on her profile, and next month.
 */

const SIZES = {
  sm: { box: 36, text: 13 },
  md: { box: 44, text: 15 },
  lg: { box: 64, text: 22 },
} as const;

interface StaffAvatarProps {
  name: string;
  /** Stable id behind the colour. Falls back to the name. */
  seed?: string;
  size?: keyof typeof SIZES;
}

export function StaffAvatar({ name, seed, size = "md" }: StaffAvatarProps) {
  const ring = colors.avatarPalette[avatarIndexFor(seed || name, colors.avatarPalette.length)];
  const dimensions = SIZES[size];

  return (
    <View
      style={[
        styles.avatar,
        { width: dimensions.box, height: dimensions.box, borderColor: ring },
      ]}
    >
      <Text style={[styles.initials, { fontSize: dimensions.text }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  initials: { ...typography.heading, color: colors.textPrimary },
});

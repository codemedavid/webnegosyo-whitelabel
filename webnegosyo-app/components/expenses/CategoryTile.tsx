import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { CategoryLook } from "../../lib/expenses/category-look";
import { Icon } from "../Icon";

interface CategoryTileProps {
  look: CategoryLook;
  /** Edge of the tile; the mark scales with it. 30 rows, 32 grid, 44 detail. */
  size?: number;
  /** Voided rows: the tile fades with the amount. */
  isMuted?: boolean;
}

const ICON_SCALE = 0.5;
const INITIALS_SCALE = 0.36;
const CORNER_SCALE = 0.32;

/**
 * A category's mark on its group's tint — the same tile in the add grid, the
 * list, Profit's bars and the detail hero (lib/expenses/category-look.ts).
 */
export function CategoryTile({ look, size = 32, isMuted = false }: CategoryTileProps) {
  const { mark, tone } = look;
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: Math.round(size * CORNER_SCALE), backgroundColor: tone.tint },
        isMuted && styles.muted,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {mark.kind === "icon" ? (
        <Icon name={mark.icon} color={tone.ink} size={Math.round(size * ICON_SCALE)} />
      ) : (
        <Text style={[styles.initials, { color: tone.ink, fontSize: Math.round(size * INITIALS_SCALE) }]} numberOfLines={1}>
          {mark.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center" },
  muted: { opacity: 0.45 },
  initials: { fontWeight: "800", letterSpacing: 0.3 },
});

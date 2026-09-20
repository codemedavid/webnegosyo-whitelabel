import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import {
  getLucideIconName,
  isLucideIcon,
} from "../lib/category-icon-catalog";
import { categoryIconNodes, type IconNode } from "../lib/category-icon-paths";
import { colors } from "../theme/colors";
import { Icon } from "./Icon";

/**
 * A category's icon.
 *
 * Deliberately NOT part of the app's own `Icon` set. Those are the product's
 * chrome, drawn in the house geometry; these are the merchant's own choice,
 * stored on the category and rendered identically by the storefront, the
 * white-labeled customer app and the web admin. Drawing them from the same
 * vendored lucide geometry (lib/category-icon-paths.ts) is what keeps the icon
 * the merchant picks on their phone the icon their customer sees.
 *
 * Three stored shapes, all of which reach here:
 *   `lucide:<name>` — a curated icon, drawn below.
 *   a raw emoji     — how categories were iconed before the library existed.
 *   empty or null   — no icon.
 */

const DEFAULT_SIZE = 22;
/** Lucide's own geometry is authored on a 24-unit box at 2 stroke. */
const LUCIDE_VIEWBOX = "0 0 24 24";
const LUCIDE_STROKE_WIDTH = 2;

interface CategoryIconProps {
  icon: string | null | undefined;
  /** Falls back to the app's accent, so an un-tinted icon is never invisible. */
  color?: string | null;
  size?: number;
  /**
   * What to draw when there is no icon, or the stored name is one this build
   * cannot draw. Rendering nothing in the second case reads as "no icon set"
   * and sends the merchant hunting for a bug in their own data, so the picker
   * and the list pass "placeholder" and get a visible mark instead.
   */
  fallback?: "none" | "placeholder";
  emojiStyle?: StyleProp<TextStyle>;
}

/** One vendored lucide primitive, as a react-native-svg element. */
function renderNode([element, attrs]: IconNode, index: number) {
  const key = `${element}-${index}`;
  switch (element) {
    case "path":
      return <Path key={key} {...attrs} />;
    case "circle":
      return <Circle key={key} {...attrs} />;
    case "rect":
      return <Rect key={key} {...attrs} />;
    case "line":
      return <Line key={key} {...attrs} />;
  }
}

export function CategoryIcon({
  icon,
  color,
  size = DEFAULT_SIZE,
  fallback = "none",
  emojiStyle,
}: CategoryIconProps) {
  const tint = color || colors.primary;

  if (icon && isLucideIcon(icon)) {
    const name = getLucideIconName(icon);
    const nodes = categoryIconNodes(name);

    if (nodes) {
      return (
        <Svg
          testID={`category-icon-${name}`}
          width={size}
          height={size}
          viewBox={LUCIDE_VIEWBOX}
          fill="none"
          stroke={tint}
          strokeWidth={LUCIDE_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          // The category's name is read out beside it; announcing the icon
          // again would just repeat it.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {nodes.map(renderNode)}
        </Svg>
      );
    }
    // An unknown name is NOT rendered as text: the merchant would see
    // "lucide:not-an-icon" sitting in their menu. It is treated as no icon.
    return placeholder(fallback, size);
  }

  if (icon) {
    return (
      <Text
        style={[{ fontSize: size }, emojiStyle]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {icon}
      </Text>
    );
  }

  return placeholder(fallback, size);
}

/** The visible stand-in for "no icon", drawn only where the caller asked for one. */
function placeholder(fallback: CategoryIconProps["fallback"], size: number) {
  if (fallback !== "placeholder") return null;

  return (
    <Icon
      name="list"
      size={size}
      color={colors.textTertiary}
      testID="category-icon-placeholder"
    />
  );
}

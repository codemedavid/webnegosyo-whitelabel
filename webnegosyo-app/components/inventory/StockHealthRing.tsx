import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import type { HealthSegment } from "../../lib/inventory-insights";
import { LEVEL_STYLE } from "./level-style";

interface StockHealthRingProps {
  segments: readonly HealthSegment[];
  /** The big figure in the middle, e.g. "86%". */
  value: string;
  caption: string;
  size?: number;
  strokeWidth?: number;
  trackColor: string;
  textColor: string;
  captionColor: string;
}

/** Visible gap between segments, in px along the circumference. */
const SEGMENT_GAP = 3;

/**
 * The shelf at a glance: one ring, out → low → stocked, clockwise from twelve.
 *
 * A shelf of forty ingredients cannot be judged by reading forty rows; it can
 * be judged by how much of a circle is green. The fractions come from
 * `healthSegments`, so this only draws.
 */
export function StockHealthRing({
  segments,
  value,
  caption,
  size = 104,
  strokeWidth = 10,
  trackColor,
  textColor,
  captionColor,
}: StockHealthRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const gap = segments.length > 1 ? SEGMENT_GAP : 0;

  let offset = 0;
  const arcs = segments.map((segment) => {
    const length = Math.max(0, segment.fraction * circumference - gap);
    const arc = { segment, length, offset };
    offset += segment.fraction * circumference;
    return arc;
  });

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${value} ${caption}`}
    >
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <G rotation={-90} origin={`${center}, ${center}`}>
          {arcs.map(({ segment, length, offset: start }) => (
            <Circle
              key={segment.level}
              cx={center}
              cy={center}
              r={radius}
              stroke={LEVEL_STYLE[segment.level].fill}
              strokeWidth={strokeWidth}
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={-start}
              strokeLinecap="butt"
              fill="none"
            />
          ))}
        </G>
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.value, { color: textColor }]}>{value}</Text>
        <Text style={[styles.caption, { color: captionColor }]}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  value: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  caption: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 1 },
});

import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

interface RewardIconProps {
  emoji: string;
  imageUrl?: string | null;
  size?: number;
  /** Ring colour; the slot decides what state it is in. */
  ringColor?: string;
  backgroundColor?: string;
}

/** A reward's face: the menu photo when there is one, its emoji otherwise. */
export function RewardIcon({ emoji, imageUrl, size = 40, ringColor = "transparent", backgroundColor = "#FFFFFF" }: RewardIconProps) {
  const frame = { width: size, height: size, borderRadius: size / 2, borderColor: ringColor, backgroundColor };
  return (
    <View style={[styles.frame, frame]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} alt="" style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }} />
      ) : (
        <Text style={{ fontSize: size * 0.52 }}>{emoji}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center", borderWidth: 2, overflow: "hidden" },
});

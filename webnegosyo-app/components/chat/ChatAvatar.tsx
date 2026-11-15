import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { getAvatarColor, getInitials } from "../../lib/order-visuals";

interface ChatAvatarProps {
  /** Who it is; draws the initials when there is no photo. */
  name: string;
  /** The customer's Messenger photo. Meta's link expires, so a failed load falls back to initials. */
  photoUrl?: string | null;
  size?: number;
}

/** A customer's Messenger photo, or their initials on the app's avatar palette. */
export function ChatAvatar({ name, photoUrl, size = 40 }: ChatAvatarProps) {
  const [hasFailed, setHasFailed] = useState(false);
  useEffect(() => setHasFailed(false), [photoUrl]);

  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (photoUrl && !hasFailed) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[shape, styles.photo]}
        onError={() => setHasFailed(true)}
        accessibilityIgnoresInvertColors
        alt=""
        testID="chat-avatar-photo"
      />
    );
  }

  return (
    <View style={[shape, styles.initials, { backgroundColor: getAvatarColor(name) }]} testID="chat-avatar-initials">
      <Text style={[styles.initialsText, { fontSize: Math.round(size * 0.38) }]}>{getInitials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: colors.primaryLight },
  initials: { alignItems: "center", justifyContent: "center" },
  initialsText: { color: colors.textOnDark, fontWeight: "800" },
});

import React from "react";
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme/colors";
import { resolveVideoEmbed, type AnnouncementBlock } from "../lib/announcements/blocks";
import { Icon } from "./Icon";

// Draws a "What's New" post body block by block. Every block is a native
// component, never a WebView, so nothing an author typed becomes markup.
// Video — uploaded or hosted — opens outside the app for now: the build has
// no in-app player, and the web composer's preview says as much.

const MEDIA_ASPECT = 16 / 9;

export function AnnouncementBlocks({ blocks }: { blocks: readonly AnnouncementBlock[] }) {
  return (
    <View style={styles.stack}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </View>
  );
}

function Block({ block }: { block: AnnouncementBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <Text style={styles.heading} accessibilityRole="header">
          {block.text}
        </Text>
      );
    case "paragraph":
      return <Text style={styles.paragraph}>{block.text}</Text>;
    case "image":
      return (
        <Figure caption={block.caption}>
          <Image source={{ uri: block.url }} style={styles.media} resizeMode="cover" accessibilityIgnoresInvertColors />
        </Figure>
      );
    case "video":
      return (
        <Figure caption={block.caption ?? "Opens in your video player"}>
          <PlayTile label="Play video" onPress={() => openExternal(block.url)} />
        </Figure>
      );
    case "embed": {
      const embed = resolveVideoEmbed(block.url);
      const provider = embed?.provider === "vimeo" ? "Vimeo" : "YouTube";
      return (
        <Figure caption={block.caption ?? `Opens in ${provider}`}>
          <PlayTile
            label={`Watch on ${provider}`}
            thumbnailUrl={embed?.thumbnailUrl ?? null}
            onPress={() => openExternal(embed?.watchUrl ?? block.url)}
          />
        </Figure>
      );
    }
  }
}

function openExternal(url: string): void {
  Linking.openURL(url).catch(() => {
    // The OS had nothing to open it with; the caption already says what it was.
  });
}

function Figure({ caption, children }: { caption?: string; children: React.ReactNode }) {
  return (
    <View>
      {children}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

function PlayTile({
  label,
  thumbnailUrl,
  onPress,
}: {
  label: string;
  thumbnailUrl?: string | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.85}
      style={styles.playTile}
    >
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <View style={styles.playBadge}>
        <Icon name="chevron" size={22} color={colors.primary} />
      </View>
      <Text style={styles.playLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  heading: { ...typography.heading, color: colors.textPrimary },
  paragraph: { ...typography.body, color: colors.textPrimary, lineHeight: 23 },
  media: {
    width: "100%",
    aspectRatio: MEDIA_ASPECT,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
  },
  caption: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  playTile: {
    width: "100%",
    aspectRatio: MEDIA_ASPECT,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    gap: spacing.sm,
  },
  playBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
  },
  playLabel: { ...typography.caption, color: colors.textOnDark, fontWeight: "600" },
});

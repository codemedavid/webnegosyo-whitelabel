import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type {
  MessagePreview as Preview,
  PreviewSegment,
} from "../../lib/sms/message-preview";
import { colors, radius, spacing, typography } from "../../theme/colors";

/**
 * The message as it will arrive, on a phone.
 *
 * A merchant was once asked to write `Hi {{firstName}}, we miss you at
 * {{storeName}}!` into a bare textarea and send it to several hundred people
 * without ever seeing the sentence that would land. This draws that sentence
 * inside a messaging screen — the store's name at the top, the text as a
 * received bubble — and lights up the words that change for each guest, so
 * "{{firstName}} becomes their name" is shown, not explained.
 *
 * The cost sits in this panel's footer rather than in a box of its own: the
 * number of SMS is a property of the words above it, and every step that
 * separated them let a merchant edit the message without noticing the price
 * double.
 */

interface MessagePreviewProps {
  preview: Preview;
  /** From `buildPreviewSegments` — the same sentence, with personal words marked. */
  segments: readonly PreviewSegment[];
  /** From `describeCampaignCost` — segments are a fact about this exact text. */
  cost: { segmentsPerMessage: number; encoding: string; totalSegments: number };
  recipientCount: number;
  /** Whose details filled the placeholders, when it was a real recipient. */
  recipientName: string | null;
  storeName: string;
  /** When the text will land, e.g. "Today · 10:00 AM". */
  timestamp: string;
  /** Hides the cost footer, for places that show the cost elsewhere. */
  isCompact?: boolean;
}

export function MessagePreview({
  preview,
  segments,
  cost,
  recipientCount,
  recipientName,
  storeName,
  timestamp,
  isCompact = false,
}: MessagePreviewProps) {
  const initial = storeName.trim().charAt(0).toUpperCase() || "S";
  const hasPersonalWords = segments.some((segment) => segment.isPersonal);

  return (
    <View style={styles.wrap}>
      <View style={styles.bezel} accessibilityLabel={`Preview: ${preview.body}`}>
        <View style={styles.screen}>
          <View style={styles.chatHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.chatTitle}>
              <Text style={styles.storeName} numberOfLines={1}>
                {storeName}
              </Text>
              <Text style={styles.chatMeta}>Text message</Text>
            </View>
          </View>

          <View style={styles.thread}>
            <Text style={styles.timestamp}>{timestamp}</Text>
            {preview.isEmpty ? (
              <View style={[styles.bubble, styles.bubbleEmpty]}>
                <Text style={styles.emptyText}>Your message will appear here as you type.</Text>
              </View>
            ) : (
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>
                  {segments.map((segment, index) => (
                    <Text
                      // Segments are positional runs of one sentence; their
                      // order is their identity.
                      key={index}
                      style={segment.isPersonal ? styles.personal : undefined}
                    >
                      {segment.text}
                    </Text>
                  ))}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {!preview.isEmpty && (
        <Text style={styles.attribution}>
          {preview.isSample
            ? "Shown for an example guest."
            : `As ${recipientName || "your first guest"} will read it.`}
          {hasPersonalWords ? " Highlighted words change for each guest." : ""}
        </Text>
      )}

      {preview.problem && <Text style={styles.problem}>{preview.problem}</Text>}

      {!isCompact && (
        <View style={styles.footer}>
          <Text style={styles.cost}>
            {cost.segmentsPerMessage} SMS each · {cost.encoding === "UCS2" ? "Unicode" : "Plain"}
          </Text>
          <Text style={styles.costTotal}>
            {recipientCount} {recipientCount === 1 ? "guest" : "guests"} ≈ {cost.totalSegments} SMS
          </Text>
        </View>
      )}

      {/*
        One curly apostrophe flips the whole blast to UCS-2 and more than
        doubles the bill. Nothing on the phone shows this, which is why it is
        said in the panel where the price is.
      */}
      {cost.encoding === "UCS2" && (
        <Text style={styles.problem}>
          A special character (often a curly apostrophe or an emoji) roughly doubles the
          cost. Plain letters are cheaper.
        </Text>
      )}
    </View>
  );
}

/** The word colour for personalised runs: a deep coral that holds 5.7:1 on the bubble. */
const PERSONAL_INK = colors.statusPreparing.text;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  // The handset is ink with a narrow bezel, the one dark object on the cream
  // canvas — it is the thing the merchant is about to put in guests' hands.
  bezel: {
    backgroundColor: colors.heroInk,
    borderRadius: 28,
    padding: 6,
  },
  screen: {
    backgroundColor: colors.card,
    borderRadius: 22,
    overflow: "hidden",
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.textOnDark, fontWeight: "800", fontSize: 15 },
  chatTitle: { flex: 1 },
  storeName: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  chatMeta: { ...typography.small, color: colors.textSecondary },
  thread: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    minHeight: 120,
  },
  timestamp: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: "center",
    fontWeight: "600",
  },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    // The one squared corner is the tail: this has to read as a message that
    // arrived, not as a card.
    borderBottomLeftRadius: 6,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
  },
  bubbleEmpty: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    borderStyle: "dashed",
  },
  bubbleText: { ...typography.body, color: colors.textPrimary, lineHeight: 21 },
  personal: { color: PERSONAL_INK, fontWeight: "700" },
  emptyText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  attribution: { ...typography.small, color: colors.textSecondary, lineHeight: 16 },
  problem: { ...typography.small, color: colors.danger, fontWeight: "600", lineHeight: 16 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cost: { ...typography.small, color: colors.textSecondary },
  costTotal: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
});

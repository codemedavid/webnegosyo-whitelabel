import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MessagePreview as Preview } from "../../lib/sms/message-preview";
import { colors, radius, spacing, typography } from "../../theme/colors";

/**
 * The message as it will arrive.
 *
 * This is the thing the editor never had. A merchant was asked to write
 * `Hi {{firstName}}, we miss you at {{storeName}}!` into a bare textarea and
 * then send it to several hundred people, and nothing on the screen ever
 * showed them the sentence that would land. Placeholders are the one part of a
 * campaign that cannot be checked by reading what you typed.
 *
 * Drawn as a received bubble — squared off at the bottom-left corner it would
 * be anchored to — because that is what the merchant is about to be
 * responsible for, and it is what they will see on their own handset when they
 * send themselves a test.
 *
 * The cost sits in this panel's footer rather than in a box of its own: the
 * number of segments is a property of the words above it, and every step that
 * separated them let a merchant edit the message without noticing the price
 * double.
 */

interface MessagePreviewProps {
  preview: Preview;
  /** From `describeCampaignCost` — segments are a fact about this exact text. */
  cost: { segmentsPerMessage: number; encoding: string; totalSegments: number };
  recipientCount: number;
  /** Whose details filled the placeholders, when it was a real recipient. */
  recipientName: string | null;
}

export function MessagePreview({
  preview,
  cost,
  recipientCount,
  recipientName,
}: MessagePreviewProps) {
  return (
    <View style={styles.panel}>
      {preview.isEmpty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Write a message above and it will appear here, exactly as a guest reads it.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{preview.body}</Text>
          </View>
          <Text style={styles.attribution}>
            {preview.isSample
              ? "An example guest — nobody matches this campaign yet."
              : `As ${recipientName ?? "your first recipient"} will read it.`}
          </Text>
        </>
      )}

      {preview.problem && <Text style={styles.problem}>{preview.problem}</Text>}

      <View style={styles.footer}>
        <Text style={styles.cost}>
          {cost.segmentsPerMessage} SMS each · {cost.encoding === "UCS2" ? "Unicode" : "Plain"}
        </Text>
        <Text style={styles.costTotal}>
          {recipientCount} {recipientCount === 1 ? "guest" : "guests"} ≈ {cost.totalSegments} SMS
        </Text>
      </View>

      {/*
        One curly apostrophe flips the whole blast to UCS-2 and more than
        doubles the bill. Nothing on the phone shows this, which is why it is
        said in the panel where the price is.
      */}
      {cost.encoding === "UCS2" && (
        <Text style={styles.problem}>
          A special character — often a curly apostrophe — pushed this to Unicode and
          roughly doubled the cost. Plain letters are cheaper.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "92%",
    backgroundColor: colors.card,
    borderRadius: 18,
    // The one squared corner is the tail. A bubble rounded on all four sides
    // is a card; this has to read as a message that arrived.
    borderBottomLeftRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  bubbleText: { ...typography.body, color: colors.textPrimary, lineHeight: 21 },
  attribution: { ...typography.small, color: colors.textSecondary },
  empty: { paddingVertical: spacing.sm },
  emptyText: { ...typography.caption, color: colors.textTertiary, lineHeight: 18 },
  problem: { ...typography.small, color: colors.warning, fontWeight: "600", lineHeight: 16 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingTop: spacing.sm,
  },
  cost: { ...typography.small, color: colors.textSecondary },
  costTotal: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
});

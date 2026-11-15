import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { newClientId, type PreviewMessage, type StaffChip } from "../../lib/messenger-chat/staff-chat";
import { previewStaffCard, sendStaffCard } from "../../lib/messenger-chat/staff-chat-service";

interface QuickSendSheetProps {
  /** The quick action being looked at; null = closed. */
  chip: StaffChip | null;
  tenantId: string;
  sessionId: string;
  /** Who it goes to, for the title. */
  name: string;
  onClose: () => void;
  /** It went out (or had already gone out). */
  onSent: () => void;
}

type Stage =
  | { kind: "loading" }
  | { kind: "ready"; messages: PreviewMessage[] }
  | { kind: "error"; error: string };

/**
 * A quick action before it goes: exactly what the customer will get (the
 * server builds the same messages the bot would send), then one Send. A stray
 * tap on a chip never messages anyone.
 */
export function QuickSendSheet({ chip, tenantId, sessionId, name, onClose, onSent }: QuickSendSheetProps) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // One id per opened preview: a retry after a timeout is the same tap, sent once.
  const clientId = useRef(newClientId());

  useEffect(() => {
    if (!chip) return;
    let isCurrent = true;
    clientId.current = newClientId();
    setStage({ kind: "loading" });
    setSendError(null);
    void previewStaffCard({ tenantId, sessionId }, chip.card, chip.orderId).then((result) => {
      if (!isCurrent) return;
      setStage(result.ok ? { kind: "ready", messages: result.value } : { kind: "error", error: result.error });
    });
    return () => {
      isCurrent = false;
    };
  }, [chip, tenantId, sessionId]);

  const send = async () => {
    if (!chip || isSending) return;
    setIsSending(true);
    setSendError(null);
    const result = await sendStaffCard({ tenantId, sessionId }, clientId.current, chip.card, chip.orderId);
    setIsSending(false);
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    onSent();
  };

  return (
    <Modal visible={chip !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title} numberOfLines={1}>{chip?.label ?? ""}</Text>
              <Text style={styles.subtitle}>{name} gets this in Messenger. The bot keeps answering.</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent}>
            {stage.kind === "loading" ? <ActivityIndicator color={colors.textMuted} style={styles.spinner} /> : null}
            {stage.kind === "error" ? <Text style={styles.error}>{stage.error}</Text> : null}
            {stage.kind === "ready" ? stage.messages.map((message, index) => <PreviewBubble key={index} message={message} />) : null}
          </ScrollView>

          {sendError ? <Text style={styles.error}>{sendError}</Text> : null}
          <Button
            label={sendError ? "Try again" : `Send to ${name}`}
            size="lg"
            fullWidth
            isLoading={isSending}
            disabled={stage.kind !== "ready"}
            onPress={() => void send()}
          />
        </View>
      </View>
    </Modal>
  );
}

function PreviewBubble({ message }: { message: PreviewMessage }) {
  const quickReplies = message.quickReplies ?? [];
  return (
    <View style={styles.message}>
      {message.kind === "cards" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
          {message.cards.map((card, index) => (
            <View key={index} style={styles.card}>
              {card.imageUrl ? <Image source={{ uri: card.imageUrl }} style={styles.cardImage} accessibilityIgnoresInvertColors alt="" /> : null}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>{card.title}</Text>
                {card.subtitle ? <Text style={styles.cardSubtitle} numberOfLines={3}>{card.subtitle}</Text> : null}
              </View>
              {(card.buttons ?? []).map((button, buttonIndex) => (
                <Text key={buttonIndex} style={styles.cardButton} numberOfLines={1}>{button.title}</Text>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{message.text}</Text>
          {message.kind === "buttons"
            ? message.buttons.map((button, index) => (
                <Text key={index} style={styles.bubbleButton} numberOfLines={1}>{button.title}</Text>
              ))
            : null}
        </View>
      )}
      {quickReplies.length > 0 ? (
        <View style={styles.quickReplies}>
          {quickReplies.map((reply, index) => (
            <Text key={index} style={styles.quickReply} numberOfLines={1}>{reply.title}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    maxHeight: "88%",
    minHeight: "50%",
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerCopy: { flex: 1 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textMuted },
  close: { ...typography.body, fontWeight: "700", color: colors.accent },
  preview: { flexGrow: 0 },
  previewContent: { gap: spacing.md, paddingVertical: spacing.sm },
  spinner: { paddingVertical: spacing.xxl },
  error: { ...typography.caption, fontWeight: "700", color: colors.danger },
  message: { gap: spacing.sm, alignItems: "flex-end" },
  bubble: {
    maxWidth: "88%",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm / 2,
    padding: spacing.md,
    gap: spacing.sm,
  },
  bubbleText: { ...typography.body, color: colors.textOnDark },
  bubbleButton: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    textAlign: "center",
    overflow: "hidden",
  },
  cards: { gap: spacing.sm, paddingLeft: spacing.xl },
  card: {
    width: 220,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    overflow: "hidden",
  },
  cardImage: { width: "100%", height: 116, backgroundColor: colors.surfaceSubtle },
  cardBody: { padding: spacing.md, gap: 2 },
  cardTitle: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  cardSubtitle: { ...typography.small, color: colors.textMuted },
  cardButton: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.accent,
    textAlign: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  quickReplies: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: spacing.xs },
  quickReply: {
    ...typography.small,
    fontWeight: "700",
    color: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    overflow: "hidden",
  },
});

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Modal } from "../Modal";
import { ChatLine } from "./ChatLine";
import { colors, radius, spacing, typography } from "../../theme/colors";
import {
  fillChoicesFor,
  findInChat,
  isFillableLine,
  type ChatFillChoice,
  type ChatFillTarget,
} from "../../lib/messenger-chat/chat-order";
import { useChatThread } from "../../lib/messenger-chat/use-chats";

interface ChatFillSheetProps {
  visible: boolean;
  sessionId: string;
  /** Who the chat is with, for the title. */
  name: string;
  /** The Facebook name, offered as the order's name. Null when Meta gave none. */
  facebookName: string | null;
  onClose: () => void;
  /** Write one detail onto the sale. Returns the line that says where it went. */
  onFill: (target: ChatFillTarget, value: string) => string;
}

/**
 * The customer's chat, open beside the sale being rung up for them.
 *
 * Staff used to retype a phone number or an address from the Page inbox. Here
 * a number the customer typed is offered as one tap, and any line they wrote
 * can be tapped and used as the name, the phone, the address or the order's
 * note. Nothing is guessed and nothing is filled without a tap; every field
 * can still be typed over on the payment screen.
 */
export function ChatFillSheet({ visible, sessionId, name, facebookName, onClose, onFill }: ChatFillSheetProps) {
  const insets = useSafeAreaInsets();
  const { thread, isLoading, error, refetch } = useChatThread(visible ? sessionId : null);
  const [picked, setPicked] = useState<{ id: string; choices: ChatFillChoice[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  // Opens at the newest line, where the number or address usually is; once
  // per opening, so picking a line (which grows the list) never jumps away.
  const threadRef = useRef<ScrollView>(null);
  const hasScrolledToNewest = useRef(false);
  useEffect(() => {
    if (!visible) hasScrolledToNewest.current = false;
  }, [visible]);
  const scrollToNewestOnce = () => {
    if (hasScrolledToNewest.current || messages.length === 0) return;
    hasScrolledToNewest.current = true;
    threadRef.current?.scrollToEnd({ animated: false });
  };
  const found = useMemo(() => findInChat(messages), [messages]);

  const fill = (target: ChatFillTarget, value: string) => {
    setNotice(onFill(target, value));
    setPicked(null);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title} numberOfLines={1}>
                Chat with {name}
              </Text>
              <Text style={styles.subtitle}>Tap a message to use it on this order.</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the chat" hitSlop={10}>
              <Text style={styles.done}>Done</Text>
            </TouchableOpacity>
          </View>

          {facebookName || found.phones.length > 0 ? (
            <View style={styles.found} accessibilityLabel="Found in chat">
              <Text style={styles.foundTitle}>Found in chat</Text>
              <View style={styles.chips}>
                {facebookName ? (
                  <TouchableOpacity
                    style={styles.chip}
                    onPress={() => fill("name", facebookName)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${facebookName} as the name`}
                  >
                    <Text style={styles.chipText}>Name · {facebookName}</Text>
                  </TouchableOpacity>
                ) : null}
                {found.phones.map((phone) => (
                  <TouchableOpacity
                    key={phone}
                    style={styles.chip}
                    onPress={() => fill("phone", phone)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${phone} as the phone number`}
                  >
                    <Text style={styles.chipText}>Phone · {phone}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {notice ? (
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null}

          {isLoading ? (
            <Text style={styles.muted}>Loading the chat…</Text>
          ) : error ? (
            <TouchableOpacity onPress={() => void refetch()} accessibilityRole="button">
              <Text style={styles.muted}>The chat could not be loaded. Tap to try again.</Text>
            </TouchableOpacity>
          ) : messages.length === 0 ? (
            <Text style={styles.muted}>No messages in the last 30 days.</Text>
          ) : (
            <ScrollView
              ref={threadRef}
              style={styles.thread}
              contentContainerStyle={styles.threadContent}
              onContentSizeChange={scrollToNewestOnce}
            >
              {messages.map((message) => {
                const isPicked = picked?.id === message.id;
                if (!isFillableLine(message)) return <ChatLine key={message.id} message={message} />;
                return (
                  <View key={message.id} style={styles.fillable}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setPicked(isPicked ? null : { id: message.id, choices: fillChoicesFor(message) })}
                      accessibilityRole="button"
                      accessibilityLabel={`Use this message: ${message.body}`}
                    >
                      <ChatLine message={message} />
                    </TouchableOpacity>
                    {isPicked ? (
                      <View style={styles.choices}>
                        {picked.choices.map((choice) => (
                          <TouchableOpacity
                            key={choice.target}
                            style={styles.choice}
                            onPress={() => fill(choice.target, choice.value)}
                            accessibilityRole="button"
                          >
                            <Text style={styles.choiceText}>{choice.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    maxHeight: "88%",
    minHeight: "55%",
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
  done: { ...typography.body, fontWeight: "700", color: colors.accent },
  found: { gap: spacing.xs },
  foundTitle: { ...typography.small, fontWeight: "700", color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  chipText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  notice: { ...typography.caption, fontWeight: "700", color: colors.statusPreparing.text },
  muted: { ...typography.caption, color: colors.textMuted, paddingVertical: spacing.lg },
  thread: { flexGrow: 0 },
  threadContent: { gap: spacing.sm, paddingBottom: spacing.lg },
  fillable: { gap: spacing.xs },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginLeft: spacing.sm },
  choice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  choiceText: { ...typography.caption, fontWeight: "700", color: colors.textOnDark },
});

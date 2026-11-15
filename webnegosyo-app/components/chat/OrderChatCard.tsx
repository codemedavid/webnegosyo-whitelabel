import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../Card";
import { ChatAvatar } from "./ChatAvatar";
import { ChatLine } from "./ChatLine";
import { chatHref } from "../../lib/navigation";
import {
  botState,
  chatCustomerName,
  hasMessageSinceOrder,
  messengerPsidOf,
  newestLines,
} from "../../lib/messenger-chat/chat";
import { chatSessionIdOf, describeChatOrder, type ChatOrderStatus } from "../../lib/messenger-chat/chat-order";
import { useChatOrderRecords, useChatThread, useOrderChats } from "../../lib/messenger-chat/use-chats";
import { useTickerNow } from "../TickerProvider";

interface OrderChatCardProps {
  order: {
    _id: string;
    _creationTime: number;
    status: string;
    customerName?: string | null;
    customerData?: Record<string, unknown> | null;
    /** Set while the order (or a change to it) waits on this phone for a connection. */
    offlineSync?: string | null;
  };
  style?: ViewStyle;
}

/**
 * The Messenger chat behind this order: who wrote, and the last few lines.
 *
 * Staff used to open the Page inbox to learn what "pa-extra sauce po" a
 * customer added after ordering. Draws nothing for an order that did not come
 * from a chat, for a store off the platform order system, or for an account
 * the database would not show the chat to.
 */
export function OrderChatCard({ order, style }: OrderChatCardProps) {
  const orders = useMemo(() => [order], [order]);
  const { byOrderId, isLoading, error, refetch } = useOrderChats(orders);
  // An order staff rang up for a chat names the chat itself, before (and
  // whether or not) the server attached the customer's Messenger id.
  const chatSessionId = chatSessionIdOf(order.customerData);
  const sessionByPsid = byOrderId.get(order._id) ?? null;
  const { thread, isLoading: isThreadLoading, error: threadError, refetch: refetchThread } = useChatThread(
    sessionByPsid?.id ?? chatSessionId,
  );
  // The thread names its customer only when it was asked for by the chat's own id.
  const session = sessionByPsid ?? (chatSessionId ? thread?.session ?? null : null);
  const { byOrderId: chatOrders, knownOrderIds } = useChatOrderRecords(orders);
  const nowMs = useTickerNow();

  const hasPsid = messengerPsidOf(order.customerData) !== null;
  if (!hasPsid && !chatSessionId) return null;

  // A sale still on this phone is known too: the server cannot have its row yet.
  const chatOrder = knownOrderIds.has(order._id) || order.offlineSync
    ? describeChatOrder(
        { status: order.status, createdAt: order._creationTime, customerData: order.customerData, offlineSync: order.offlineSync },
        chatOrders.get(order._id) ?? null,
        nowMs,
      )
    : null;

  if (isLoading || (!session && chatSessionId !== null && isThreadLoading)) {
    return (
      <Card title="Messenger chat" style={style}>
        <Text style={styles.muted}>Looking for this customer&apos;s chat…</Text>
      </Card>
    );
  }

  if (error || threadError) {
    return (
      <Card title="Messenger chat" style={style}>
        <Text style={styles.muted}>Could not load this customer&apos;s chat.</Text>
        <TouchableOpacity
          onPress={() => void (error ? refetch() : refetchThread())}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.link}>Try again</Text>
        </TouchableOpacity>
      </Card>
    );
  }

  // No readable chat: the order is from Messenger, but nothing was logged yet
  // (or this account may not read it). The order card already says "Messenger".
  if (!session) {
    return chatOrder ? (
      <Card title="Messenger chat" style={style}>
        <ChatOrderNote status={chatOrder} />
      </Card>
    ) : null;
  }

  const name = chatCustomerName(session, order.customerName);
  const lines = newestLines(thread?.messages ?? []);
  const bot = botState(session, nowMs);
  const hasNew = hasMessageSinceOrder(session, { createdAt: order._creationTime, status: order.status });

  return (
    <Card title="Messenger chat" style={style}>
      <View style={styles.head}>
        <ChatAvatar name={name} photoUrl={session.photoUrl} size={36} />
        <View style={styles.who}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {bot.label}
          </Text>
        </View>
        {hasNew ? (
          <View style={styles.newChip}>
            <Text style={styles.newText}>Wrote after ordering</Text>
          </View>
        ) : null}
      </View>

      {chatOrder ? <ChatOrderNote status={chatOrder} /> : null}

      {isThreadLoading ? (
        <Text style={styles.muted}>Loading the last messages…</Text>
      ) : lines.length === 0 ? (
        <Text style={styles.muted}>No messages in the last 30 days.</Text>
      ) : (
        <View style={styles.lines}>
          {lines.map((line) => (
            <ChatLine key={line.id} message={line} compact />
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.open}
        onPress={() => router.push(chatHref(session.id))}
        accessibilityRole="button"
        accessibilityLabel={`See the chat with ${name}`}
        hitSlop={8}
      >
        <Text style={styles.link}>See chat</Text>
      </TouchableOpacity>
    </Card>
  );
}

/** Where the customer's confirmation stands, and what staff can do about it. */
function ChatOrderNote({ status }: { status: ChatOrderStatus }) {
  return (
    <View
      style={[styles.note, status.tone === "attention" ? styles.noteAttention : status.tone === "done" ? styles.noteDone : null]}
      accessibilityLabel={`${status.label}. ${status.detail}`}
    >
      <Text style={styles.noteTitle}>{status.label}</Text>
      <Text style={styles.noteDetail}>{status.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  who: { flex: 1 },
  name: { ...typography.heading, color: colors.textPrimary },
  muted: { ...typography.caption, color: colors.textMuted },
  newChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
  },
  newText: { ...typography.small, fontWeight: "700", color: colors.statusPreparing.text },
  lines: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  note: {
    gap: 2,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.statusPending.bg,
  },
  noteAttention: { backgroundColor: colors.dangerLight },
  noteDone: { backgroundColor: colors.statusReady.bg },
  noteTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  noteDetail: { ...typography.caption, color: colors.textMuted },
  open: { alignSelf: "flex-start", marginTop: spacing.md },
  link: { ...typography.body, fontWeight: "700", color: colors.accent },
});

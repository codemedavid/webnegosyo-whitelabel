import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { BackHeader } from "../../components/BackHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ChatAvatar } from "../../components/chat/ChatAvatar";
import { useTickerNow } from "../../components/TickerProvider";
import { chatHref } from "../../lib/navigation";
import { formatDailyOrderNumber } from "../../lib/order-number";
import { getStatusMeta } from "../../lib/order-visuals";
import {
  botState,
  chatCustomerName,
  formatChatAge,
  mergeChatPages,
  needsReplyLabel,
  sortChatsForMonitoring,
} from "../../lib/messenger-chat/chat";
import { platformChatDb } from "../../lib/messenger-chat/client";
import { fetchChats, type ChatListEntry } from "../../lib/messenger-chat/repo";
import { useCanReadChats, useChats } from "../../lib/messenger-chat/use-chats";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

// The store's Messenger conversations, newest first, each with the customer's
// latest order. Opened from the Orders header: it answers "who is this, and
// what did they say?" without leaving the app for the Page inbox.

const ChatRow = React.memo(function ChatRow({ entry, nowMs }: { entry: ChatListEntry; nowMs: number }) {
  const { session, order } = entry;
  const name = chatCustomerName(session);
  const bot = botState(session, nowMs);
  const status = order ? getStatusMeta(order.status) : null;
  const waiting = needsReplyLabel(session, nowMs);

  return (
    <TouchableOpacity
      style={[styles.row, waiting !== null && styles.rowWaiting]}
      activeOpacity={0.8}
      onPress={() => router.push(chatHref(session.id))}
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${name}. ${session.lastMessagePreview ?? ""}`}
    >
      <ChatAvatar name={name} photoUrl={session.photoUrl} size={44} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.age}>{formatChatAge(session.lastMessageAt, nowMs)}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {session.lastMessagePreview ?? "No recent message"}
        </Text>
        {order || bot.isPaused || waiting ? (
          <View style={styles.chips}>
            {waiting ? (
              <View style={[styles.chip, styles.waitingChip]}>
                <Text style={[styles.chipText, styles.waitingText]}>{waiting}</Text>
              </View>
            ) : null}
            {order && status ? (
              <View style={[styles.chip, { backgroundColor: status.bg }]}>
                <Text style={[styles.chipText, { color: status.text }]}>
                  {formatDailyOrderNumber(order.dailyNumber, order.id)} · {status.label}
                </Text>
              </View>
            ) : null}
            {bot.isPaused ? (
              <View style={[styles.chip, styles.pausedChip]}>
                <Text style={[styles.chipText, styles.pausedText]}>{bot.label}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

export default function ChatsScreen() {
  const { canRead, tenantId } = useCanReadChats();
  const { chats, hasMore, isLoading, isRefetching, error, refetch } = useChats();
  const nowMs = useTickerNow();

  // Pages after the first live here; a refresh starts over from the newest.
  const [more, setMore] = useState<ChatListEntry[]>([]);
  const [canLoadMore, setCanLoadMore] = useState<boolean | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setMore([]);
    setCanLoadMore(null);
  }, [chats]);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const all = useMemo(() => mergeChatPages(chats, more), [chats, more]);
  // Who waits on a person sits on top, longest wait first.
  const shown = useMemo(() => sortChatsForMonitoring(all), [all]);
  const waitingCount = useMemo(() => all.filter((entry) => entry.session.needsReplySince != null).length, [all]);
  const hasNextPage = canLoadMore ?? hasMore;
  const renderRow = useCallback(({ item }: { item: ChatListEntry }) => <ChatRow entry={item} nowMs={nowMs} />, [nowMs]);

  const loadMore = useCallback(async () => {
    const last = all[all.length - 1];
    if (!hasNextPage || isLoadingMore || !tenantId || !last?.session.lastMessageAt) return;
    setIsLoadingMore(true);
    const result = await fetchChats(platformChatDb, tenantId, last.session.lastMessageAt);
    setIsLoadingMore(false);
    if (!result.ok) return;
    setMore((current) => [...current, ...result.value.chats]);
    setCanLoadMore(result.value.hasMore);
  }, [all, hasNextPage, isLoadingMore, tenantId]);

  return (
    <View style={styles.screen}>
      <BackHeader title="Chats" subtitle="Messenger conversations, last 30 days" />
      {!canRead ? (
        <EmptyState
          icon="message"
          title="Chats aren't available here"
          message="Chats show for stores on SmartMenu's order system, to accounts that can see orders."
        />
      ) : error && chats.length === 0 ? (
        <ErrorState message={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState fullScreen />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(entry) => entry.session.id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            waitingCount > 0 ? (
              <View style={styles.summary} accessibilityRole="summary">
                <Text style={styles.summaryCount}>{waitingCount}</Text>
                <Text style={styles.summaryText}>
                  {waitingCount === 1 ? "customer is waiting for a person" : "customers are waiting for a person"}
                </Text>
              </View>
            ) : null
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          ListEmptyComponent={
            <EmptyState
              icon="message"
              title="No chats yet"
              message="When a customer messages your Facebook Page, the conversation shows here."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    ...shadow.sm,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  age: { ...typography.caption, color: colors.textMuted },
  preview: { ...typography.caption, color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  chipText: { fontSize: 11, fontWeight: "700" },
  pausedChip: { backgroundColor: colors.primaryLight },
  rowWaiting: { borderLeftWidth: 3, borderLeftColor: colors.accent },
  waitingChip: { backgroundColor: colors.accentLight },
  waitingText: { color: colors.statusPreparing.text },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.heroInk,
    marginBottom: spacing.xs,
  },
  summaryCount: { fontSize: 28, fontWeight: "800", color: colors.heroInkText },
  summaryText: { ...typography.caption, fontWeight: "700", color: colors.heroInkText, flex: 1 },
  pausedText: { color: colors.textPrimary },
});

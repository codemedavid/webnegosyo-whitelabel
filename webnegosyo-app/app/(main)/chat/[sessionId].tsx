import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackHeader } from "../../../components/BackHeader";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { ChatAvatar } from "../../../components/chat/ChatAvatar";
import { ChatComposer } from "../../../components/chat/ChatComposer";
import { ChatLine } from "../../../components/chat/ChatLine";
import { ChatOrderStrip } from "../../../components/chat/ChatOrderStrip";
import { PendingReplies } from "../../../components/chat/PendingReplies";
import { QuickSendSheet } from "../../../components/chat/QuickSendSheet";
import { useTickerNow } from "../../../components/TickerProvider";
import { openExternalUrl } from "../../../lib/safe-url";
import {
  chatCustomerName,
  orderMessages,
  toChatRows,
  type ChatMessage,
  type ChatRow,
} from "../../../lib/messenger-chat/chat";
import { platformChatDb } from "../../../lib/messenger-chat/client";
import { fetchOlderMessages } from "../../../lib/messenger-chat/repo";
import { botSwitch, lockReason, windowNote, type StaffChip } from "../../../lib/messenger-chat/staff-chat";
import { startChatOrder } from "../../../lib/messenger-chat/start-chat-order";
import { useChatReply } from "../../../lib/messenger-chat/use-chat-reply";
import {
  useCanMakeChatOrders,
  useCanReadChats,
  useChats,
  useChatThread,
  useStaffChatTools,
} from "../../../lib/messenger-chat/use-chats";
import { useIsScreenFocused } from "../../../lib/query/use-screen-focus";
import { registerNeedsBranch } from "../../../lib/register-outlet";
import { goTo } from "../../../lib/tab-navigation";
import { useAuthStore } from "../../../stores/auth-store";
import { useBranchContextStore } from "../../../stores/branch-context-store";
import { usePosCartStore } from "../../../stores/pos-cart-store";
import { colors, radius, spacing, typography } from "../../../theme/colors";

// One customer's Messenger chat: what they asked, what the bot answered,
// what staff said. Accounts that may take chat orders (store-wide, `pos`)
// reply here too: typed replies (they pause the bot for the store's takeover
// time, like Page Inbox), quick actions (the bot's own cards, previewed before
// they go, never pausing it) and the bot switch. After 24 hours Messenger
// refuses any reply from the app, so the screen points to Business Suite.
//
// "Make order" opens the register for this customer: the order is saved
// waiting and its summary goes to them in Messenger to confirm
// (`lib/messenger-chat/start-chat-order.ts`).

/** Meta Business Suite's inbox; opens the app when it is installed. */
const INBOX_URL = "https://business.facebook.com/latest/inbox/all";

export default function ChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  // Keyed by the chat: a different chat starts from its own newest page, with
  // no draft, earlier lines or pending replies of the one before.
  return <ChatThreadScreen key={sessionId} sessionId={sessionId} />;
}

function ChatThreadScreen({ sessionId }: { sessionId: string }) {
  const { canRead } = useCanReadChats();
  const canMakeOrders = useCanMakeChatOrders();
  // Read again every few seconds only while this chat is the screen in view
  // (a pushed screen stays mounted behind the tabs; the background stops it too).
  const isOnScreen = useIsScreenFocused();
  const { thread, isLoading, error, refetch } = useChatThread(sessionId, { isLive: isOnScreen });
  const staffTools = useStaffChatTools(sessionId, { isLive: isOnScreen });
  const tenantId = useAuthStore((s) => s.tenantId);
  const viewerId = useAuthStore((s) => s.userId);
  const [quickChip, setQuickChip] = useState<StaffChip | null>(null);
  const { chats } = useChats();
  const nowMs = useTickerNow();
  const insets = useSafeAreaInsets();

  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState<boolean | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);

  // Coming back to the chat shows what was said meanwhile at once.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const messages = useMemo(() => orderMessages([...older, ...(thread?.messages ?? [])]), [older, thread]);
  // Newest first: the list is inverted, so the latest line sits at the bottom.
  const rows = useMemo(() => toChatRows(messages, nowMs).reverse(), [messages, nowMs]);
  const canLoadOlder = hasOlder ?? thread?.hasOlder ?? false;

  const { refetch: refetchTools } = staffTools;
  const readAgain = useCallback(() => {
    void refetch();
    void refetchTools();
  }, [refetch, refetchTools]);
  const reply = useChatReply({ tenantId, sessionId, messages, onChanged: readAgain });

  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest || isLoadingOlder) return;
    setIsLoadingOlder(true);
    setOlderError(false);
    const result = await fetchOlderMessages(platformChatDb, sessionId, oldest.sentAt);
    setIsLoadingOlder(false);
    if (!result.ok) {
      setOlderError(true);
      return;
    }
    setOlder((current) => [...result.value.messages, ...current]);
    setHasOlder(result.value.hasOlder);
  }, [messages, sessionId, isLoadingOlder]);

  const renderRow = useCallback(({ item }: { item: ChatRow }) => {
    if (item.type === "day") {
      return (
        <View style={styles.day}>
          <Text style={styles.dayText}>{item.label}</Text>
        </View>
      );
    }
    return <ChatLine message={item.message} viewerId={viewerId} />;
  }, [viewerId]);

  if (!canRead) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Chat" />
        <EmptyState icon="message" title="Chats aren't available here" message="This account can't read customer chats for this store." />
      </View>
    );
  }

  if (error && !thread) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Chat" />
        <ErrorState message={error} onRetry={() => void refetch()} />
      </View>
    );
  }

  if (isLoading || thread === undefined) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Chat" />
        <LoadingState fullScreen />
      </View>
    );
  }

  if (thread === null) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Chat" />
        <EmptyState icon="message" title="Chat not found" message="It may be older than 30 days, or belong to another branch." />
      </View>
    );
  }

  const { session } = thread;
  const tools = staffTools.tools;
  const bot = botSwitch(tools, session.botPausedUntil, nowMs);
  const latestOrder = chats.find((entry) => entry.session.id === session.id)?.order ?? null;
  const name = chatCustomerName(session);

  const makeOrder = () =>
    startChatOrder(
      { sessionId: session.id, name, firstName: session.firstName, lastName: session.lastName },
      {
        register: () => usePosCartStore.getState(),
        needsBranch: () => registerNeedsBranch(useAuthStore.getState(), useBranchContextStore.getState()),
        alert: (title, message, buttons) => Alert.alert(title, message, buttons),
        navigate: (href) => goTo(router, href),
      },
    );

  const canSwitchBot = canMakeOrders && tools !== null && tools.blocked === null && bot.actionLabel !== "";
  const locked = canMakeOrders ? lockReason(tools) : null;
  // The chips come from the web route; when it fails the box must not look complete.
  const toolsFailed = canMakeOrders && tools === null && staffTools.error !== null && !staffTools.isLoading;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <BackHeader
        title={name}
        subtitle={`Messenger · ${bot.label}`}
        actions={
          <View style={styles.headerActions}>
            {canSwitchBot ? (
              <TouchableOpacity
                style={[styles.botSwitch, bot.isPaused && styles.botSwitchPaused]}
                onPress={() => void reply.switchBot(!bot.isPaused)}
                disabled={reply.isSwitchingBot}
                accessibilityRole="button"
                accessibilityLabel={bot.actionLabel}
                accessibilityState={{ busy: reply.isSwitchingBot, disabled: reply.isSwitchingBot }}
                hitSlop={6}
              >
                {reply.isSwitchingBot ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Text style={styles.botSwitchText}>{bot.isPaused ? "Bot on" : "Pause bot"}</Text>
                )}
              </TouchableOpacity>
            ) : null}
            <ChatAvatar name={name} photoUrl={session.photoUrl} size={36} />
          </View>
        }
      />

      {latestOrder ? <ChatOrderStrip order={latestOrder} /> : null}

      <FlatList
        data={rows}
        inverted
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        // Inverted: the header sits at the bottom, under the newest line.
        ListHeaderComponent={<PendingReplies replies={reply.pending} onRetry={reply.retry} onDismiss={reply.dismiss} />}
        ListEmptyComponent={
          // Inverted lists flip their empty component too; flip it back.
          <View style={styles.flipBack}>
            <EmptyState icon="message" title="No messages to show" message="Lines older than 30 days are removed." />
          </View>
        }
        ListFooterComponent={
          canLoadOlder ? (
            <TouchableOpacity
              style={styles.older}
              onPress={() => void loadOlder()}
              disabled={isLoadingOlder}
              accessibilityRole="button"
              accessibilityState={{ busy: isLoadingOlder }}
              hitSlop={8}
            >
              <Text style={styles.olderText}>
                {isLoadingOlder ? "Loading…" : olderError ? "Couldn't load earlier messages. Try again" : "Show earlier messages"}
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {toolsFailed ? (
        <TouchableOpacity
          style={styles.toolsFailed}
          onPress={() => void refetchTools()}
          accessibilityRole="button"
          accessibilityLabel="Quick actions could not be loaded. Retry"
        >
          <Text style={styles.toolsFailedText}>Quick actions unavailable · Retry</Text>
        </TouchableOpacity>
      ) : null}

      {canMakeOrders ? (
        <ChatComposer
          chips={tools?.chips ?? []}
          lockedReason={locked}
          windowNote={tools ? windowNote(tools, nowMs) : null}
          draft={reply.draft}
          onChangeDraft={reply.setDraft}
          onSend={reply.submitDraft}
          onChip={setQuickChip}
          onOpenInbox={() => void openExternalUrl(INBOX_URL)}
          onMakeOrder={makeOrder}
          bottomInset={Math.max(insets.bottom, spacing.md)}
        />
      ) : (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Text style={styles.footerNote}>You can read the chat here. Replies are sent from your Page inbox.</Text>
          <Button label="Reply in Business Suite" tone="secondary" fullWidth onPress={() => void openExternalUrl(INBOX_URL)} />
        </View>
      )}

      {tenantId ? (
        <QuickSendSheet
          chip={quickChip}
          tenantId={tenantId}
          sessionId={session.id}
          name={name}
          onClose={() => setQuickChip(null)}
          onSent={() => {
            setQuickChip(null);
            readAgain();
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  flipBack: { transform: [{ scaleY: -1 }] },
  day: { alignSelf: "center", paddingVertical: spacing.sm },
  dayText: { ...typography.eyebrow, color: colors.textMuted },
  older: { alignSelf: "center", paddingVertical: spacing.md },
  olderText: { ...typography.caption, fontWeight: "700", color: colors.accent },
  toolsFailed: { alignSelf: "center", paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  toolsFailedText: { ...typography.caption, fontWeight: "700", color: colors.textMuted },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  footerNote: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  botSwitch: {
    minHeight: 32,
    minWidth: 76,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  botSwitchPaused: { backgroundColor: colors.statusPending.bg, borderColor: colors.statusPending.bg },
  botSwitchText: { ...typography.small, fontWeight: "700", color: colors.textPrimary },
});

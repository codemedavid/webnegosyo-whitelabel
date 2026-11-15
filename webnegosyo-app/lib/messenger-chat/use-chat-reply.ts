/**
 * The chat screen's reply box: the draft, the replies on their way (with a
 * retry that reuses the same tap, so a timed-out send is never delivered
 * twice), and the bot switch. After each the thread and the quick actions are
 * read again.
 */

import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import type { ChatMessage } from "./chat";
import { newClientId, stillPending, type PendingReply } from "./staff-chat";
import { sendStaffText, setChatBotPaused } from "./staff-chat-service";

export interface ChatReplyInput {
  tenantId: string | null;
  sessionId: string;
  /** The lines on screen: a sent reply leaves the pending list once the log shows it. */
  messages: readonly ChatMessage[];
  /** Read the thread and the quick actions again. */
  onChanged: () => void;
}

export interface ChatReply {
  draft: string;
  setDraft: (text: string) => void;
  submitDraft: () => void;
  /** Replies not yet in the chat log: sending, sent, or failed with a retry. */
  pending: readonly PendingReply[];
  retry: (reply: PendingReply) => void;
  dismiss: (clientId: string) => void;
  isSwitchingBot: boolean;
  switchBot: (pause: boolean) => Promise<void>;
}

export function useChatReply({ tenantId, sessionId, messages, onChanged }: ChatReplyInput): ChatReply {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingReply[]>([]);
  const [isSwitchingBot, setIsSwitchingBot] = useState(false);

  const sendReply = useCallback(
    async (reply: PendingReply) => {
      if (!tenantId) return;
      setPending((current) => [...current.filter((entry) => entry.clientId !== reply.clientId), { ...reply, status: "sending", error: undefined }]);
      const result = await sendStaffText({ tenantId, sessionId }, reply.clientId, reply.text);
      setPending((current) =>
        current.map((entry) =>
          entry.clientId === reply.clientId
            ? result.ok
              ? { ...entry, status: "sent" }
              : { ...entry, status: "failed", error: result.error }
            : entry,
        ),
      );
      onChanged();
    },
    [tenantId, sessionId, onChanged],
  );

  const submitDraft = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void sendReply({ clientId: newClientId(), text, createdAt: Date.now(), status: "sending" });
  }, [draft, sendReply]);

  const retry = useCallback((reply: PendingReply) => void sendReply(reply), [sendReply]);
  const dismiss = useCallback(
    (clientId: string) => setPending((current) => current.filter((entry) => entry.clientId !== clientId)),
    [],
  );

  const switchBot = useCallback(
    async (pause: boolean) => {
      if (!tenantId || isSwitchingBot) return;
      setIsSwitchingBot(true);
      const result = await setChatBotPaused({ tenantId, sessionId }, pause);
      setIsSwitchingBot(false);
      if (!result.ok) Alert.alert("The bot didn't change", result.error);
      onChanged();
    },
    [tenantId, sessionId, isSwitchingBot, onChanged],
  );

  const shown = useMemo(() => stillPending(pending, messages), [pending, messages]);

  return { draft, setDraft, submitDraft, pending: shown, retry, dismiss, isSwitchingBot, switchBot };
}

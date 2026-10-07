/**
 * The Owl conversation on the phone — the app's stand-in for the web panel's
 * `useChat` (see ui-stream.ts for why it isn't that package).
 *
 * Same contract as the web: only the NEW message travels (the server rebuilds
 * history from storage, so nothing here can forge a past tool result), the
 * conversation id comes back on the first chunk's metadata, and a refusal
 * (auth, flag, budget) is a plain JSON error shown under the thread.
 *
 * Streams with expo/fetch — React Native's own fetch buffers the whole body.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetch as expoFetch } from "expo/fetch";
import { getWebAppUrl } from "../web-app-url";
import { assistantToken, AssistantRequestError, loadConversation } from "./api";
import { conversationIdOf, GENERIC_ERROR, MAX_INPUT_CHARS, PHOTO_ONLY_TEXT, readRefusal } from "./presentation";
import { applyStreamChunk, emptyAssistantMessage, splitSseEvents, type StreamChunk } from "./ui-stream";
import type { AssistantMessage, ChatStatus } from "./types";

const DONE_EVENT = "[DONE]";

export interface UseAssistantChat {
  messages: AssistantMessage[];
  status: ChatStatus;
  error: string | null;
  isBusy: boolean;
  /** `photos`: menu photos as data URLs, sent with this message only. */
  send: (text: string, photos?: readonly string[]) => void;
  stop: () => void;
  startOver: () => void;
  /** Load a past conversation into the thread. Throws its error for the caller to show. */
  reopen: (conversationId: string) => Promise<void>;
}

export function createMessageId(): string {
  return `app_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function parseChunk(payload: string): StreamChunk | null {
  try {
    const chunk = JSON.parse(payload) as unknown;
    return chunk && typeof chunk === "object" && typeof (chunk as StreamChunk).type === "string" ? (chunk as StreamChunk) : null;
  } catch {
    return null;
  }
}

export function useAssistantChat(tenantId: string | null): UseAssistantChat {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isBusy = status === "submitted" || status === "streaming";

  const abortCurrent = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // A different store (a superadmin switching tenants) never inherits a thread.
  useEffect(() => {
    abortCurrent();
    conversationRef.current = null;
    setMessages([]);
    setError(null);
    setStatus("ready");
  }, [tenantId, abortCurrent]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stream = useCallback(
    async (userMessage: AssistantMessage, text: string, photos: readonly string[], controller: AbortController) => {
      if (!tenantId) throw new AssistantRequestError(GENERIC_ERROR);
      const token = await assistantToken();
      const response = await expoFetch(`${getWebAppUrl()}/api/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tenantId,
          conversationId: conversationRef.current,
          message: photos.length > 0 ? { id: userMessage.id, text, images: photos } : { id: userMessage.id, text },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new AssistantRequestError(readRefusal(body, response.status));
      }

      let assistant = emptyAssistantMessage(createMessageId());
      let hasStarted = false;
      const publish = () => {
        const snapshot = assistant;
        // Captured now: the updater runs later, after `hasStarted` has flipped.
        const isReplacing = hasStarted;
        setMessages((previous) =>
          isReplacing ? [...previous.slice(0, -1), snapshot] : [...previous, snapshot],
        );
        hasStarted = true;
        conversationRef.current = conversationIdOf([snapshot]) ?? conversationRef.current;
      };

      const handleEvents = (events: string[]): boolean => {
        let isDone = false;
        let didChange = false;
        for (const event of events) {
          if (event === DONE_EVENT) {
            isDone = true;
            continue;
          }
          const chunk = parseChunk(event);
          if (!chunk) continue;
          // The server's stream error text is for logs; the owner gets the web's line.
          if (chunk.type === "error") setError(GENERIC_ERROR);
          const next = applyStreamChunk(assistant, chunk);
          if (next !== assistant) {
            assistant = next;
            didChange = true;
          }
        }
        if (didChange) {
          setStatus("streaming");
          publish();
        }
        return isDone;
      };

      const reader = response.body?.getReader();
      if (!reader) {
        const whole = await response.text();
        handleEvents(splitSseEvents(`${whole}\n`).events);
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = splitSseEvents(buffer);
        buffer = rest;
        if (handleEvents(events)) break;
      }
      handleEvents(splitSseEvents(`${buffer}\n`).events);
    },
    [tenantId],
  );

  const send = useCallback(
    (raw: string, photos: readonly string[] = []) => {
      const text = (raw.trim() || (photos.length > 0 ? PHOTO_ONLY_TEXT : "")).slice(0, MAX_INPUT_CHARS);
      if (!text || isBusy || !tenantId) return;
      abortCurrent();
      const controller = new AbortController();
      abortRef.current = controller;
      // The photos ride along as file parts so the thread can show them; only a count survives on the server.
      const userMessage: AssistantMessage = {
        id: createMessageId(),
        role: "user",
        parts: [{ type: "text", text }, ...photos.map((url) => ({ type: "file", mediaType: "image/jpeg", url }))],
      };
      setError(null);
      setMessages((previous) => [...previous, userMessage]);
      setStatus("submitted");

      stream(userMessage, text, photos, controller)
        .then(() => {
          if (abortRef.current === controller) setStatus("ready");
        })
        .catch((failure: unknown) => {
          // Stopped, superseded or unmounted on purpose — not an error.
          if (controller.signal.aborted) return;
          setError(failure instanceof AssistantRequestError ? failure.message : GENERIC_ERROR);
          setStatus("error");
        })
        .finally(() => {
          if (abortRef.current === controller) abortRef.current = null;
        });
    },
    [abortCurrent, isBusy, stream, tenantId],
  );

  const stop = useCallback(() => {
    abortCurrent();
    setStatus("ready");
  }, [abortCurrent]);

  const startOver = useCallback(() => {
    abortCurrent();
    conversationRef.current = null;
    setMessages([]);
    setError(null);
    setStatus("ready");
  }, [abortCurrent]);

  const reopen = useCallback(
    async (conversationId: string) => {
      if (!tenantId) return;
      const loaded = await loadConversation(tenantId, conversationId);
      abortCurrent();
      conversationRef.current = conversationId;
      setMessages(loaded);
      setError(null);
      setStatus("ready");
    },
    [abortCurrent, tenantId],
  );

  return { messages, status, error, isBusy, send, stop, startOver, reopen };
}

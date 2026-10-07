/**
 * Reads the Owl's streamed answer: the AI SDK v6 "UI message stream" that
 * `/api/assistant/chat` returns (`toUIMessageStreamResponse`).
 *
 * The web reads it with `useChat`; the app can't take that package (its React
 * peer range excludes the React pinned by React Native), so this is the small
 * part of it the Owl needs: SSE framing plus a pure reducer that grows ONE
 * assistant message from the chunks. The message keeps the web's `UIMessage`
 * field names, so stored conversations render the same on both surfaces.
 *
 * Wire format (one JSON object per `data:` line, ended by `data: [DONE]`):
 *   start{messageId,messageMetadata} · text-start/-delta/-end{id} ·
 *   tool-input-start/-available{toolCallId,toolName} · tool-output-available ·
 *   tool-output-error / tool-input-error{errorText} · message-metadata ·
 *   error{errorText} · finish. Anything else is ignored.
 */

import type { AssistantMessage, MessagePart, TextPart, ToolPart } from "./types";

export interface StreamChunk {
  type: string;
  [key: string]: unknown;
}

const DATA_PREFIX = "data:";

/** Complete `data:` payloads in `buffer`, and the unfinished tail to keep. */
export function splitSseEvents(buffer: string): { events: string[]; rest: string } {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  const events = lines
    .filter((line) => line.startsWith(DATA_PREFIX))
    .map((line) => line.slice(DATA_PREFIX.length).trim())
    .filter((payload) => payload.length > 0);
  return { events, rest };
}

export function emptyAssistantMessage(id: string): AssistantMessage {
  return { id, role: "assistant", parts: [] };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isToolPart(part: MessagePart): part is ToolPart {
  return part.type.startsWith("tool-") && typeof (part as ToolPart).toolCallId === "string";
}

function withParts(message: AssistantMessage, parts: MessagePart[]): AssistantMessage {
  return { ...message, parts };
}

function mergeMetadata(message: AssistantMessage, metadata: unknown): AssistantMessage {
  if (!metadata || typeof metadata !== "object") return message;
  return { ...message, metadata: { ...(message.metadata ?? {}), ...(metadata as Record<string, unknown>) } };
}

function upsertTool(message: AssistantMessage, toolCallId: string, patch: Partial<ToolPart>, toolName?: string): AssistantMessage {
  const index = message.parts.findIndex((part) => isToolPart(part) && part.toolCallId === toolCallId);
  if (index === -1) {
    if (!toolName) return message;
    const created: ToolPart = { type: `tool-${toolName}`, toolCallId, state: "input-streaming", ...patch };
    return withParts(message, [...message.parts, created]);
  }
  const parts = message.parts.map((part, at) => (at === index ? { ...(part as ToolPart), ...patch } : part));
  return withParts(message, parts);
}

function appendText(message: AssistantMessage, id: string, delta: string): AssistantMessage {
  const index = message.parts.findIndex((part) => part.type === "text" && (part as TextPart).id === id);
  if (index === -1) return withParts(message, [...message.parts, { type: "text", id, text: delta }]);
  const parts = message.parts.map((part, at) =>
    at === index ? { ...(part as TextPart), text: (part as TextPart).text + delta } : part,
  );
  return withParts(message, parts);
}

/** The message after one chunk. Pure: the input is never modified. */
export function applyStreamChunk(message: AssistantMessage, chunk: StreamChunk): AssistantMessage {
  const toolCallId = asString(chunk.toolCallId);
  switch (chunk.type) {
    case "start": {
      const id = asString(chunk.messageId);
      return mergeMetadata(id ? { ...message, id } : message, chunk.messageMetadata);
    }
    case "message-metadata":
    case "finish":
      return mergeMetadata(message, chunk.messageMetadata);
    case "text-start":
      return appendText(message, asString(chunk.id) ?? "text", "");
    case "text-delta":
      return appendText(message, asString(chunk.id) ?? "text", asString(chunk.delta) ?? "");
    case "tool-input-start":
      return toolCallId ? upsertTool(message, toolCallId, { state: "input-streaming" }, asString(chunk.toolName)) : message;
    case "tool-input-available":
      return toolCallId
        ? upsertTool(message, toolCallId, { state: "input-available", input: chunk.input }, asString(chunk.toolName))
        : message;
    case "tool-output-available":
      return toolCallId ? upsertTool(message, toolCallId, { state: "output-available", output: chunk.output }) : message;
    case "tool-input-error":
    case "tool-output-error":
      return toolCallId
        ? upsertTool(
            message,
            toolCallId,
            { state: "output-error", errorText: asString(chunk.errorText) ?? "" },
            asString(chunk.toolName),
          )
        : message;
    default:
      return message;
  }
}

/**
 * The Owl's answer arrives as an AI SDK v6 UI message stream (SSE). The
 * fixture is a REAL stream produced by the same `ai` version the web pins
 * (a tool call, its card, then text), so a protocol drift shows up here.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { applyStreamChunk, emptyAssistantMessage, splitSseEvents, type StreamChunk } from "./ui-stream";
import type { AssistantMessage, ToolPart } from "./types";

const FIXTURE = readFileSync(join(__dirname, "__fixtures__", "tool-then-text.sse"), "utf8");

function replay(source: string, chunkSize: number): { message: AssistantMessage; isDone: boolean; errors: string[] } {
  let buffer = "";
  let message = emptyAssistantMessage("local-id");
  let isDone = false;
  const errors: string[] = [];
  for (let index = 0; index < source.length; index += chunkSize) {
    buffer += source.slice(index, index + chunkSize);
    const { events, rest } = splitSseEvents(buffer);
    buffer = rest;
    for (const event of events) {
      if (event === "[DONE]") {
        isDone = true;
        continue;
      }
      const chunk = JSON.parse(event) as StreamChunk;
      if (chunk.type === "error") errors.push(String(chunk.errorText));
      message = applyStreamChunk(message, chunk);
    }
  }
  return { message, isDone, errors };
}

describe("splitSseEvents", () => {
  test("returns complete data events and keeps a partial line for the next read", () => {
    const { events, rest } = splitSseEvents('data: {"type":"start"}\n\ndata: {"type":"te');
    expect(events).toEqual(['{"type":"start"}']);
    expect(rest).toBe('data: {"type":"te');
  });

  test("ignores comments and blank lines, tolerates CRLF", () => {
    const { events } = splitSseEvents(': ping\r\n\r\ndata: [DONE]\r\n\r\n');
    expect(events).toEqual(["[DONE]"]);
  });
});

describe("applyStreamChunk over a real stream", () => {
  test.each([1, 7, 64, 100000])("rebuilds the same message whatever the network chunking (%i bytes)", (size) => {
    const { message, isDone, errors } = replay(FIXTURE, size);

    expect(isDone).toBe(true);
    expect(errors).toEqual([]);
    expect(message.id).toBe("msg_1");
    expect(message.metadata?.conversationId).toBe("c-1");

    const tool = message.parts.find((part) => part.type === "tool-get_sales_overview") as ToolPart;
    expect(tool.state).toBe("output-available");
    expect(tool.input).toEqual({ period: "week" });
    expect((tool.output as { card: { title: string } }).card.title).toBe("This week");

    const text = message.parts.filter((part) => part.type === "text").map((part) => (part as { text: string }).text);
    expect(text).toEqual(["Sales were **up** 12% this week."]);
  });

  test("never mutates the message it was given", () => {
    const before = emptyAssistantMessage("x");
    const frozen = Object.freeze({ ...before, parts: Object.freeze([...before.parts]) }) as AssistantMessage;
    expect(() => applyStreamChunk(frozen, { type: "text-start", id: "t" })).not.toThrow();
    expect(frozen.parts).toHaveLength(0);
  });
});

describe("applyStreamChunk edge cases", () => {
  test("a tool that fails shows as an error part, not a crash", () => {
    let message = emptyAssistantMessage("x");
    message = applyStreamChunk(message, { type: "tool-input-available", toolCallId: "c", toolName: "get_inventory", input: {} });
    message = applyStreamChunk(message, { type: "tool-output-error", toolCallId: "c", errorText: "boom" });
    expect(message.parts).toEqual([
      { type: "tool-get_inventory", toolCallId: "c", state: "output-error", input: {}, errorText: "boom" },
    ]);
  });

  test("output for an unknown tool call is ignored", () => {
    const message = applyStreamChunk(emptyAssistantMessage("x"), { type: "tool-output-available", toolCallId: "nope", output: {} });
    expect(message.parts).toEqual([]);
  });

  test("late metadata merges instead of replacing", () => {
    let message = applyStreamChunk(emptyAssistantMessage("x"), { type: "start", messageId: "m", messageMetadata: { conversationId: "c" } });
    message = applyStreamChunk(message, { type: "message-metadata", messageMetadata: { other: 1 } });
    expect(message.metadata).toEqual({ conversationId: "c", other: 1 });
  });

  test("unknown chunk types pass through untouched", () => {
    const message = emptyAssistantMessage("x");
    expect(applyStreamChunk(message, { type: "reasoning-delta", id: "r", delta: "hm" })).toBe(message);
  });
});

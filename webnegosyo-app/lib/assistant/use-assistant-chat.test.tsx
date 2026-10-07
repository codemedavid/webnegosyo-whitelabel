/**
 * The phone's Owl conversation, end to end against a real AI SDK v6 stream:
 * only the new message is sent (with the user's bearer token), the answer
 * grows in place under the owner's question, the conversation id from the
 * stream is reused on the next turn, and a refusal shows the server's words.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockExpoFetch = jest.fn();
jest.mock("expo/fetch", () => ({ fetch: (...args: unknown[]) => mockExpoFetch(...args) }));
jest.mock("../authorized-post", () => ({ getAccessTokenBounded: async () => "user-token" }));
jest.mock("../web-app-url", () => ({ getWebAppUrl: () => "https://web.test" }));

import { useAssistantChat } from "./use-assistant-chat";

const FIXTURE = readFileSync(join(__dirname, "__fixtures__", "tool-then-text.sse"), "utf8");

function streamResponse(text: string, pieceSize = 40) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (offset >= bytes.length) return { done: true, value: undefined };
          const value = bytes.slice(offset, offset + pieceSize);
          offset += pieceSize;
          return { done: false, value };
        },
      }),
    },
  };
}

function refusalResponse(status: number, error: string) {
  return { ok: false, status, json: async () => ({ error }) };
}

function sentBody(callIndex: number) {
  return JSON.parse(mockExpoFetch.mock.calls[callIndex][1].body as string);
}

beforeEach(() => {
  mockExpoFetch.mockReset();
});

test("streams a tool card and text into one assistant message under the question", async () => {
  mockExpoFetch.mockResolvedValue(streamResponse(FIXTURE));
  const { result } = renderHook(() => useAssistantChat("tenant-1"));

  act(() => result.current.send("  How were sales this week?  "));
  await waitFor(() => expect(result.current.status).toBe("ready"));

  const [url, init] = mockExpoFetch.mock.calls[0];
  expect(url).toBe("https://web.test/api/assistant/chat");
  expect(init.headers.Authorization).toBe("Bearer user-token");
  expect(sentBody(0)).toEqual({
    tenantId: "tenant-1",
    conversationId: null,
    message: { id: expect.any(String), text: "How were sales this week?" },
  });

  const roles = result.current.messages.map((message) => message.role);
  expect(roles).toEqual(["user", "assistant"]);
  const answer = result.current.messages[1];
  expect(answer.parts.some((part) => part.type === "tool-get_sales_overview")).toBe(true);
  expect(answer.parts.find((part) => part.type === "text")).toMatchObject({ text: "Sales were **up** 12% this week." });
  expect(result.current.error).toBeNull();
});

test("the next turn continues the same conversation", async () => {
  mockExpoFetch.mockImplementation(async () => streamResponse(FIXTURE));
  const { result } = renderHook(() => useAssistantChat("tenant-1"));

  act(() => result.current.send("first"));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  act(() => result.current.send("second"));
  await waitFor(() => expect(mockExpoFetch).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.status).toBe("ready"));

  expect(sentBody(1).conversationId).toBe("c-1");
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
});

test("a refusal keeps the question and shows the server's sentence", async () => {
  mockExpoFetch.mockResolvedValue(refusalResponse(429, "Your store has used today’s assistant allowance. It resets at midnight."));
  const { result } = renderHook(() => useAssistantChat("tenant-1"));

  act(() => result.current.send("hello"));
  await waitFor(() => expect(result.current.status).toBe("error"));

  expect(result.current.error).toBe("Your store has used today’s assistant allowance. It resets at midnight.");
  expect(result.current.messages.map((message) => message.role)).toEqual(["user"]);
});

test("start over forgets the conversation", async () => {
  mockExpoFetch.mockImplementation(async () => streamResponse(FIXTURE));
  const { result } = renderHook(() => useAssistantChat("tenant-1"));

  act(() => result.current.send("first"));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  act(() => result.current.startOver());
  act(() => result.current.send("fresh"));
  await waitFor(() => expect(mockExpoFetch).toHaveBeenCalledTimes(2));

  expect(sentBody(1).conversationId).toBeNull();
});

/** Sends its first chunk, then waits until the request is aborted. */
function stallingResponse(signal: AbortSignal) {
  const first = new TextEncoder().encode('data: {"type":"start","messageId":"m-stall"}\n\ndata: {"type":"text-start","id":"t"}\n\ndata: {"type":"text-delta","id":"t","delta":"Half an ans"}\n\n');
  let isSent = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () => {
          if (!isSent) {
            isSent = true;
            return Promise.resolve({ done: false, value: first });
          }
          return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
        },
      }),
    },
  };
}

test("Stop mid-answer keeps the partial reply, shows no error, and the next question still sends", async () => {
  mockExpoFetch
    .mockImplementationOnce(async (_url: string, init: { signal: AbortSignal }) => stallingResponse(init.signal))
    .mockImplementationOnce(async () => streamResponse(FIXTURE));
  const { result } = renderHook(() => useAssistantChat("tenant-1"));

  act(() => result.current.send("first"));
  await waitFor(() => expect(result.current.status).toBe("streaming"));
  const firstSignal = mockExpoFetch.mock.calls[0][1].signal as AbortSignal;

  act(() => result.current.stop());

  expect(firstSignal.aborted).toBe(true);
  expect(result.current.status).toBe("ready");
  await waitFor(() => expect(result.current.messages[1].parts.find((part) => part.type === "text")).toMatchObject({ text: "Half an ans" }));
  expect(result.current.error).toBeNull();

  act(() => result.current.send("second"));
  await waitFor(() => expect(mockExpoFetch).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.error).toBeNull();
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
});

test("unmounting mid-answer aborts the request", async () => {
  mockExpoFetch.mockImplementationOnce(async (_url: string, init: { signal: AbortSignal }) => stallingResponse(init.signal));
  const { result, unmount } = renderHook(() => useAssistantChat("tenant-1"));

  act(() => result.current.send("first"));
  await waitFor(() => expect(result.current.status).toBe("streaming"));
  unmount();

  expect((mockExpoFetch.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
});

test("a server without the Owl routes (HTML 404) says so instead of a vague error", async () => {
  mockExpoFetch.mockResolvedValue({ ok: false, status: 404, json: async () => { throw new SyntaxError("Unexpected token <"); } });
  const { result } = renderHook(() => useAssistantChat("tenant-1"));

  act(() => result.current.send("hello"));
  await waitFor(() => expect(result.current.status).toBe("error"));

  expect(result.current.error).toBe("Owl isn’t available on this server yet. Please try again after the next update.");
});

test("menu photos travel with the message and show in the thread; a photo-only message still says what it wants", async () => {
  mockExpoFetch.mockResolvedValue(streamResponse(FIXTURE));
  const photo = "data:image/jpeg;base64,AAAA";
  const { result } = renderHook(() => useAssistantChat("tenant-1"));

  act(() => result.current.send("   ", [photo]));
  await waitFor(() => expect(result.current.status).toBe("ready"));

  expect(sentBody(0).message).toEqual({ id: expect.any(String), text: "Add the dishes in this photo to my menu.", images: [photo] });
  expect(result.current.messages[0].parts).toEqual([
    { type: "text", text: "Add the dishes in this photo to my menu." },
    { type: "file", mediaType: "image/jpeg", url: photo },
  ]);
});

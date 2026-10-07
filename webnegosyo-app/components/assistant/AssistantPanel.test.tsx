/**
 * The Owl panel as the owner meets it: the same starters as the web, a tapped
 * starter streams an answer with its card and follow-up chips, a proposal is
 * applied only by the owner's Confirm tap, and past chats reopen with their
 * proposals' current outcome.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockExpoFetch = jest.fn();
const mockFetch = jest.fn();
jest.mock("expo/fetch", () => ({ fetch: (...args: unknown[]) => mockExpoFetch(...args) }));
jest.mock("../../lib/authorized-post", () => ({ getAccessTokenBounded: async () => "user-token" }));
jest.mock("../../lib/web-app-url", () => ({ getWebAppUrl: () => "https://web.test" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import { AssistantPanel } from "./AssistantPanel";

const FIXTURE = readFileSync(join(__dirname, "..", "..", "lib", "assistant", "__fixtures__", "tool-then-text.sse"), "utf8");
const TENANT = "11111111-1111-4111-8111-111111111111";
const IN_AN_HOUR = new Date(Date.now() + 3_600_000).toISOString();

function sse(chunks: unknown[]): string {
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
}

function streamResponse(text: string) {
  const bytes = new TextEncoder().encode(text);
  let isRead = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (isRead) return { done: true, value: undefined };
          isRead = true;
          return { done: false, value: bytes };
        },
      }),
    },
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body };
}

const PROPOSAL_STREAM = sse([
  { type: "start", messageId: "m2", messageMetadata: { conversationId: "c-9" } },
  { type: "tool-input-available", toolCallId: "p1", toolName: "propose_voucher", input: {} },
  {
    type: "tool-output-available",
    toolCallId: "p1",
    output: {
      facts: { status: "pending" },
      card: { type: "confirm", actionId: "22222222-2222-4222-8222-222222222222", title: "New voucher SAVE10", lines: [{ label: "Discount", value: "10% off" }], expiresAt: IN_AN_HOUR },
    },
  },
  { type: "finish" },
]);

beforeEach(() => {
  mockExpoFetch.mockReset();
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

function renderPanel(onOpenLink = jest.fn()) {
  render(<AssistantPanel tenantId={TENANT} isOpen onClose={jest.fn()} onOpenLink={onOpenLink} />);
  return { onOpenLink };
}

test("shows the web's welcome and starter prompts", () => {
  renderPanel();
  expect(screen.getByText("Hi! What would you like to know?")).toBeTruthy();
  expect(screen.getByText("How were sales this week?")).toBeTruthy();
  expect(screen.getByText("What stock is running low?")).toBeTruthy();
});

test("a starter streams the answer, its card and its follow-up chips", async () => {
  mockExpoFetch.mockResolvedValue(streamResponse(FIXTURE));
  renderPanel();

  fireEvent.press(screen.getByText("How were sales this week?"));

  expect(await screen.findByText("This week")).toBeTruthy();
  expect(screen.getByText("₱1,000")).toBeTruthy();
  expect(screen.getByText("up")).toBeTruthy();
  expect(await screen.findByText("Best sellers")).toBeTruthy();
  expect(JSON.parse(mockExpoFetch.mock.calls[0][1].body).message.text).toBe("How were sales this week?");
});

test("a proposal changes nothing until Confirm, then shows the outcome", async () => {
  mockExpoFetch.mockResolvedValue(streamResponse(PROPOSAL_STREAM));
  mockFetch.mockResolvedValue(jsonResponse({ status: "applied", message: "Voucher SAVE10 is ready.", link: { label: "Open Vouchers", path: "/vouchers" } }));
  const { onOpenLink } = renderPanel();

  fireEvent.press(screen.getByText("Give me offer ideas"));
  expect(await screen.findByText("New voucher SAVE10")).toBeTruthy();
  expect(screen.getByText("NEEDS YOUR OK")).toBeTruthy();
  expect(mockFetch).not.toHaveBeenCalled();

  fireEvent.press(screen.getByText("Confirm"));

  expect(await screen.findByText("Voucher SAVE10 is ready.")).toBeTruthy();
  const [url, init] = mockFetch.mock.calls[0];
  expect(url).toBe("https://web.test/api/assistant/actions/22222222-2222-4222-8222-222222222222");
  expect(init.headers.Authorization).toBe("Bearer user-token");
  expect(JSON.parse(init.body)).toEqual({ tenantId: TENANT, decision: "confirm" });

  fireEvent.press(screen.getByText("Open Vouchers →"));
  expect(onOpenLink).toHaveBeenCalledWith({ label: "Open Vouchers", path: "/vouchers" });
});

test("a refusal shows the server's own sentence", async () => {
  mockExpoFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "The assistant isn't enabled for this store yet." }) });
  renderPanel();

  fireEvent.press(screen.getByText("When am I busiest?"));

  expect(await screen.findByText("The assistant isn't enabled for this store yet.")).toBeTruthy();
});

test("past chats reopen with a settled proposal shown as settled", async () => {
  mockFetch
    .mockResolvedValueOnce(jsonResponse({ conversations: [{ id: "33333333-3333-4333-8333-333333333333", title: "Weekend promo", updatedAt: "2026-10-05T09:30:00Z" }] }))
    .mockResolvedValueOnce(
      jsonResponse({
        messages: [
          { id: "u1", role: "user", parts: [{ type: "text", text: "Make a voucher" }] },
          {
            id: "a1",
            role: "assistant",
            parts: [
              { type: "step-start" },
              {
                type: "tool-propose_voucher",
                toolCallId: "p1",
                state: "output-available",
                input: {},
                output: { facts: {}, card: { type: "confirm", actionId: "a", title: "New voucher WKND", lines: [], expiresAt: IN_AN_HOUR, status: "cancelled" } },
              },
            ],
          },
        ],
      }),
    );
  renderPanel();

  fireEvent.press(screen.getByLabelText("Past chats"));
  fireEvent.press(await screen.findByText("Weekend promo"));

  expect(await screen.findByText("Make a voucher")).toBeTruthy();
  expect(screen.getByText("New voucher WKND")).toBeTruthy();
  expect(screen.getByText("Cancelled — nothing was changed.")).toBeTruthy();
  expect(screen.queryByText("Confirm")).toBeNull();
  await waitFor(() => expect(mockFetch.mock.calls[1][0]).toContain("id=33333333-3333-4333-8333-333333333333"));
});

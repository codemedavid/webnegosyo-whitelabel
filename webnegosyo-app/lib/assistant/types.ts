/**
 * Shapes of the Owl assistant, mirrored from the web (src/lib/assistant/types.ts)
 * — the app cannot import `src/`. The server owns every number and every card;
 * the app only renders what `/api/assistant/*` sends.
 *
 * A tool answers in three parts: `facts` (what the model read), `card` (what
 * the owner sees), `chips` (one-tap follow-ups).
 */

export type AssistantCard = StatsCard | RankedCard | BarsCard | ConfirmCard | LessonsCard;

export interface StatsCard {
  type: "stats";
  title: string;
  subtitle?: string;
  items: Array<{ label: string; value: string; change?: number | null; hint?: string }>;
}

export interface RankedCard {
  type: "ranked";
  title: string;
  subtitle?: string;
  rows: Array<{ label: string; value: string; detail?: string; badge?: string }>;
  emptyText?: string;
}

export interface BarsCard {
  type: "bars";
  title: string;
  subtitle?: string;
  unit: "orders" | "sales";
  bars: Array<{ label: string; value: number; isHighlight?: boolean }>;
}

/** A proposed change waiting for the owner's tap. Executed server-side from the stored payload. */
export interface ConfirmCard {
  type: "confirm";
  actionId: string;
  title: string;
  lines: Array<{ label: string; value: string }>;
  warning?: string;
  /** A picture the change uses (a hosted payment QR), an https URL. */
  imageUrl?: string;
  expiresAt: string;
  /** Filled in when a past conversation is reopened: the proposal's outcome so far. */
  status?: string;
}

/** SmartMenu University lessons (web: LessonsCard). The app opens them in the browser. */
export interface LessonsCard {
  type: "lessons";
  title: string;
  lessons: Array<{
    title: string;
    detail: string;
    /** Relative to the web's /{tenant}/admin, e.g. /learn/getting-started/inventory-management. */
    path: string;
    embedUrl: string | null;
    watchUrl: string | null;
    thumbnailUrl: string | null;
  }>;
}

/** A one-tap follow-up: tapping it sends `prompt` as the owner's next message. */
export interface AssistantChip {
  label: string;
  prompt: string;
}

/** A deep link into an admin screen, relative to the web's /{tenant}/admin. */
export interface AssistantLink {
  label: string;
  path: string;
}

export interface ToolResult {
  facts: Record<string, unknown>;
  card?: AssistantCard;
  chips?: AssistantChip[];
  links?: AssistantLink[];
}

/**
 * The parts of an AI SDK v6 UI message the Owl renders. Same field names as
 * the web's `UIMessage`, so a conversation stored by either surface reopens on
 * the other unchanged.
 */
export type ToolPartState = "input-streaming" | "input-available" | "output-available" | "output-error";

export interface TextPart {
  type: "text";
  text: string;
  /** Stream id of the text block; absent on stored messages. */
  id?: string;
}

export interface ToolPart {
  /** `tool-<toolName>`. */
  type: `tool-${string}`;
  toolCallId: string;
  state: ToolPartState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

/** Anything else the server stores (`step-start`, reasoning…) — kept, never drawn. */
export interface OtherPart {
  type: string;
  [key: string]: unknown;
}

export type MessagePart = TextPart | ToolPart | OtherPart;

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  metadata?: { conversationId?: string } & Record<string, unknown>;
}

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

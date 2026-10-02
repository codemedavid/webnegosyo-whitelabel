/**
 * AI offer ideas on the Growth tab — the client half of `POST /api/boost/ai`.
 *
 * The web app owns the engine (menu + real order baskets → combos, upgrades,
 * pairings, a cart last call), the free-run quota, and the writes. This module
 * only calls it with the merchant's own session token and checks that what
 * came back has the shape the card renders — never trust a response body.
 *
 * Contract: `callBoostAi` always settles. A stalled token refresh or a dead
 * connection becomes an Error with a message the card can show, never a
 * spinner that outlives the screen (see `authorized-post.ts`).
 */

import { getWebAppUrl } from "./web-app-url";
import { getAccessTokenBounded } from "./authorized-post";

export type BoostIdeaKind = "combo" | "upgrade" | "pairing" | "last_call";
export type BoostIdeaStatus = "pending" | "approved" | "rejected" | "applied";
export type BoostRunStatus = "running" | "succeeded" | "failed";

export interface BoostIdeaView {
  id: string;
  kind: BoostIdeaKind;
  status: BoostIdeaStatus;
  title: string;
  detail: string;
  reason: string;
  itemNames: string[];
}

export interface BoostAiLatestRun {
  status: BoostRunStatus;
  summary: string | null;
  ordersAnalyzed: number;
  createdAt: string;
  error: string | null;
}

export interface BoostAiState {
  boostEnabled: boolean;
  quota: { used: number; limit: number; left: number };
  latest: BoostAiLatestRun | null;
  proposals: BoostIdeaView[];
}

export type BoostAiRequest =
  | { tenantId: string; op: "state" | "generate" | "enable" }
  | { tenantId: string; op: "create" | "dismiss"; proposalId: string };

export interface BoostAiResult {
  state: BoostAiState;
  notice: string | null;
}

/** Reads, creates and dismissals are quick. */
export const BOOST_AI_TIMEOUT_MS = 20_000;
/** A run waits on the model (the route allows itself 60s) — give it room. */
export const BOOST_AI_GENERATE_TIMEOUT_MS = 75_000;
/** The token read must not eat the request's whole budget. */
const TOKEN_TIMEOUT_MS = 8_000;

export const BOOST_IDEA_KIND_META: Record<BoostIdeaKind, { label: string; moment: string }> = {
  combo: { label: "Combo", moment: "On the menu" },
  upgrade: { label: "Upgrade", moment: "On the item page" },
  pairing: { label: "Pairing", moment: "Right after adding" },
  last_call: { label: "Cart add-on", moment: "In the cart" },
};

const KINDS = new Set<string>(Object.keys(BOOST_IDEA_KIND_META));
const STATUSES = new Set<string>(["pending", "approved", "rejected", "applied"]);
const RUN_STATUSES = new Set<string>(["running", "succeeded", "failed"]);

/** "Create it", or — when customers would not see it yet — what the tap also does. */
export function createButtonLabel(boostEnabled: boolean): string {
  return boostEnabled ? "Create it" : "Turn on Boost Sales & create";
}

export function generateButtonLabel(state: BoostAiState | undefined): string {
  return state && state.proposals.length > 0 ? "Find new ideas" : "Find offer ideas";
}

export function quotaLine(quota: BoostAiState["quota"]): string {
  if (quota.left === 0) return `All ${quota.limit} free AI runs used — your ideas below stay available.`;
  return `${quota.left} of ${quota.limit} free AI run${quota.limit === 1 ? "" : "s"} left`;
}

/** Ideas the merchant can still act on come first; live ones after. */
export function sortIdeasForDisplay(ideas: readonly BoostIdeaView[]): BoostIdeaView[] {
  const rank = (idea: BoostIdeaView) => (idea.status === "applied" ? 1 : 0);
  return ideas
    .map((idea, index) => ({ idea, index }))
    .sort((a, b) => rank(a.idea) - rank(b.idea) || a.index - b.index)
    .map(({ idea }) => idea);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseIdea(raw: unknown): BoostIdeaView | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isString(r.id) || !isString(r.kind) || !KINDS.has(r.kind)) return null;
  if (!isString(r.status) || !STATUSES.has(r.status)) return null;
  if (!isString(r.title) || !isString(r.detail) || !isString(r.reason)) return null;
  return {
    id: r.id,
    kind: r.kind as BoostIdeaKind,
    status: r.status as BoostIdeaStatus,
    title: r.title,
    detail: r.detail,
    reason: r.reason,
    itemNames: Array.isArray(r.itemNames) ? r.itemNames.filter(isString) : [],
  };
}

function parseLatest(raw: unknown): BoostAiLatestRun | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isString(r.status) || !RUN_STATUSES.has(r.status) || !isString(r.createdAt)) return null;
  return {
    status: r.status as BoostRunStatus,
    summary: isString(r.summary) ? r.summary : null,
    ordersAnalyzed: isFiniteNumber(r.ordersAnalyzed) ? r.ordersAnalyzed : 0,
    createdAt: r.createdAt,
    error: isString(r.error) ? r.error : null,
  };
}

/** The route's state, or null when the body is not what the card can render. */
export function parseBoostAiState(raw: unknown): BoostAiState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const quota = r.quota as Record<string, unknown> | null | undefined;
  if (!quota || !isFiniteNumber(quota.used) || !isFiniteNumber(quota.limit) || !isFiniteNumber(quota.left)) {
    return null;
  }
  if (!Array.isArray(r.proposals)) return null;
  return {
    boostEnabled: r.boostEnabled === true,
    quota: { used: quota.used, limit: quota.limit, left: quota.left },
    latest: parseLatest(r.latest),
    // A malformed idea is dropped, not allowed to blank the whole list.
    proposals: r.proposals.map(parseIdea).filter((idea): idea is BoostIdeaView => idea !== null),
  };
}

export interface CallBoostAiOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (isString(body?.error) && body.error.trim() !== "") return body.error;
  } catch {
    // Not JSON — fall through to the status-based message.
  }
  if (response.status === 401) return "Please sign in again to use offer ideas.";
  if (response.status === 403) return "You do not have access to Boost Sales for this store.";
  return `Offer ideas are unavailable right now (${response.status}).`;
}

export async function callBoostAi(
  request: BoostAiRequest,
  options: CallBoostAiOptions = {},
): Promise<BoostAiResult> {
  const timeoutMs =
    options.timeoutMs ?? (request.op === "generate" ? BOOST_AI_GENERATE_TIMEOUT_MS : BOOST_AI_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;

  const token = await getAccessTokenBounded(TOKEN_TIMEOUT_MS);
  if (!token) throw new Error("Please sign in with a merchant account to use offer ideas.");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Aborted AND raced: React Native has not always turned an abort into a rejection.
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("This is taking too long. Check your connection and try again."));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchImpl(`${getWebAppUrl()}/api/boost/ai`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(request),
      }),
      expiry,
    ]);
    if (!response.ok) throw new Error(await Promise.race([readErrorMessage(response), expiry]));

    const body = (await Promise.race([response.json(), expiry])) as Record<string, unknown> | null;
    const state = parseBoostAiState(body?.state);
    if (!state) throw new Error("Offer ideas came back in a shape this app cannot read. Please update the app.");
    return { state, notice: isString(body?.notice) ? body.notice : null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A mutation on the store's deployment over plain HTTP, as the signed-in device.
 *
 * Push-token registration runs before any screen holds a Convex client, so it
 * can't borrow one. It used to send no token and ignore the answer: fine while
 * every store admits anyone, but an enforced store would refuse it and the
 * device would simply stop ringing, with nothing said anywhere.
 *
 * Contract: never throws, and the token never appears in what it reports.
 */

import { fetchWithTimeout, type FetchLike } from "./fetch-timeout";

export interface ConvexMutationRequest {
  convexUrl: string;
  path: string;
  args: Record<string, unknown>;
}

export interface ConvexMutationDeps {
  /** Bounded, and null rather than a hang (`getAccessTokenBounded`). */
  getToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
}

export type ConvexMutationResult = { ok: true } | { ok: false; error: string };

interface ConvexReply {
  status?: unknown;
  errorMessage?: unknown;
  errorData?: unknown;
  message?: unknown;
}

function send(request: ConvexMutationRequest, token: string | null, fetchImpl: FetchLike | undefined): Promise<Response> {
  return fetchWithTimeout(
    `${request.convexUrl}/api/mutation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ path: request.path, args: request.args, format: "json" }),
    },
    undefined,
    fetchImpl
  );
}

/** Production redacts `errorMessage`; only `errorData` is sure to say why. */
function reasonOf(reply: ConvexReply | null, httpStatus: number): string {
  if (typeof reply?.errorData === "string") return reply.errorData;
  if (typeof reply?.errorMessage === "string") return reply.errorMessage;
  if (typeof reply?.message === "string") return reply.message;
  return `HTTP ${httpStatus}`;
}

async function outcomeOf(response: Response): Promise<ConvexMutationResult> {
  const reply = (await response.json().catch(() => null)) as ConvexReply | null;
  if (response.ok && reply?.status !== "error") return { ok: true };
  return { ok: false, error: reasonOf(reply, response.status) };
}

/**
 * A 4xx is the deployment turning down the token itself, before any function
 * ran (a failed function answers 560): an expired token, or a store too old to
 * have an auth config. Going again without it is what such a store has always
 * admitted, and an enforced store will refuse it in words we can log.
 */
function rejectedTheToken(response: Response): boolean {
  return response.status >= 400 && response.status < 500;
}

export async function postConvexMutation(
  request: ConvexMutationRequest,
  deps: ConvexMutationDeps
): Promise<ConvexMutationResult> {
  try {
    const token = await deps.getToken().catch(() => null);
    const response = await send(request, token, deps.fetchImpl);
    if (token && rejectedTheToken(response)) {
      return await outcomeOf(await send(request, null, deps.fetchImpl));
    }
    return await outcomeOf(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

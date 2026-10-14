/**
 * What the approver's inbox and the Home card say — pure (design-spec §3.6,
 * §3.11). Pending requests arrive oldest first from the server.
 */
import { firstName, formatManilaClock, formatPesoShort, requestTitle, timeAgo } from "./state";
import type { ApprovalRequestView } from "./types";

/** "Approved 3 · Declined 1 · Expired 0" */
export function recentSummary(requests: readonly ApprovalRequestView[]): string {
  const count = (statuses: readonly string[]) => requests.filter((request) => statuses.includes(request.status)).length;
  return `Approved ${count(["approved", "executing", "executed"])} · Declined ${count(["declined"])} · Expired ${count(["expired"])}`;
}

/** One "Recently decided" row's second line. */
export function decidedLine(request: ApprovalRequestView): string {
  const who = firstName(request.decidedByName);
  const at = request.decidedAt ? ` · ${formatManilaClock(request.decidedAt)}` : "";
  switch (request.status) {
    case "executed":
    case "approved":
    case "executing":
      return `Approved by ${who}${at}${request.refundLabel ? ` · ${request.refundLabel}` : ""}`;
    case "declined":
      return `Declined by ${who}${at}`;
    case "expired":
      return "Expired · nobody answered";
    case "withdrawn":
      return `Withdrawn by ${firstName(request.requestedByName)}`;
    case "failed":
      return `Approved by ${who} · couldn't finish`;
    case "pending":
      return "Waiting";
  }
}

export interface HomeCardCopy {
  title: string;
  subtitle: string;
}

/** "Ana is waiting" / "3 requests waiting" (requests oldest first). */
export function homeCardCopy(requests: readonly ApprovalRequestView[], now: Date): HomeCardCopy {
  const [oldest] = [...requests].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (!oldest) return { title: "Nothing waiting", subtitle: "" };
  if (requests.length === 1) {
    const on = oldest.orderNumber ? ` on ${oldest.orderNumber}` : "";
    return {
      title: `${firstName(oldest.requestedByName)} is waiting`,
      subtitle: `${requestTitle(oldest)} ${formatPesoShort(oldest.amount)}${on} · ${timeAgo(oldest.createdAt, now)}`,
    };
  }
  return {
    title: `${requests.length} requests waiting`,
    subtitle: `Oldest: ${firstName(oldest.requestedByName)}, ${timeAgo(oldest.createdAt, now)}`,
  };
}

/** What a failed first load of the inbox should say. */
export type InboxLoadProblem =
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

const HTTP_NOT_FOUND = 404;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

/**
 * Status 0 never reached the server, so only then is it the connection. A 404
 * is a web app without the approvals routes (not deployed yet): nothing is
 * broken on this phone, so it reads as a notice. A refusal keeps the server's
 * own words; anything else is on our side.
 */
export function inboxLoadProblem(error: { status: number; message: string }): InboxLoadProblem {
  if (error.status === HTTP_NOT_FOUND) return { kind: "unavailable" };
  if (error.status === 0) return { kind: "error", message: "Check your connection and try again." };
  if (error.status === HTTP_UNAUTHORIZED || error.status === HTTP_FORBIDDEN) return { kind: "error", message: error.message };
  return { kind: "error", message: "Something went wrong on our side. Try again in a moment." };
}

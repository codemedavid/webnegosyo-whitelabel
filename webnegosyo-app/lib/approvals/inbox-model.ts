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

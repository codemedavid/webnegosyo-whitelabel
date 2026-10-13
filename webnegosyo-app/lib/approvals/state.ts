/**
 * What the requester's live-status card and the approver's inbox card say —
 * pure (design-spec §3.6, §3.9, §4). The screens render; this decides.
 */
import { DECLINE_REASONS, REASONS_BY_KIND, type ApprovalKind, type ApprovalRequestView } from "./types";

/** Asia/Manila is UTC+8 all year. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
/** The inbox shows a time-left chip only in the last 10 minutes. */
export const URGENT_MINUTES = 10;

export function formatPesoShort(pesos: number): string {
  const centavos = Math.round(Math.abs(pesos) * 100);
  const whole = Math.floor(centavos / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = centavos % 100;
  return `₱${whole}${rest ? `.${rest.toString().padStart(2, "0")}` : ""}`;
}

export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "Someone";
}

/** "Marco", "Marco or Lorna", "Marco, Bea or Lorna" (joiner "and" for "Sending to …"). */
export function joinNames(names: readonly string[], joiner: "or" | "and"): string {
  if (names.length === 0) return joiner === "or" ? "a manager" : "a manager";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} ${joiner} ${names[names.length - 1]}`;
}

/** "12:58 PM" in Manila time, without relying on Intl time zones (Hermes). */
export function formatManilaClock(iso: string): string {
  const local = new Date(Date.parse(iso) + MANILA_OFFSET_MS);
  const hours = local.getUTCHours();
  const minutes = local.getUTCMinutes().toString().padStart(2, "0");
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}

export interface Countdown {
  msLeft: number;
  minutesLeft: number;
  isExpired: boolean;
  /** Last 10 minutes: show the amber chip. */
  isUrgent: boolean;
  label: string;
}

export function countdown(expiresAt: string, now: Date): Countdown {
  const msLeft = Math.max(0, Date.parse(expiresAt) - now.getTime());
  const minutesLeft = Math.ceil(msLeft / 60_000);
  return {
    msLeft,
    minutesLeft,
    isExpired: msLeft === 0,
    isUrgent: msLeft > 0 && minutesLeft <= URGENT_MINUTES,
    label: msLeft === 0 ? "Expired" : minutesLeft <= 1 ? "1 min left" : `${minutesLeft} min left`,
  };
}

export function reasonLabel(kind: ApprovalKind, code: string): string {
  return REASONS_BY_KIND[kind].find((reason) => reason.code === code)?.label ?? code;
}

export function declineReasonLabel(code: string | null): string | null {
  if (!code) return null;
  return DECLINE_REASONS.find((reason) => reason.code === code)?.label ?? code;
}

const KIND_TITLE: Readonly<Record<ApprovalKind, string>> = {
  refund: "Refund",
  cancel_paid: "Cancel paid order",
  discount: "Discount",
  stock_writeoff: "Write-off",
};

export function kindTitle(kind: ApprovalKind): string {
  return KIND_TITLE[kind];
}

/** "Refund", or "Refund overpayment" for a balance refund (the order's total stays). */
export function requestTitle(request: Pick<ApprovalRequestView, "kind"> & { payload?: Record<string, unknown> | null }): string {
  if (request.kind === "refund" && request.payload?.scope === "balance") return "Refund overpayment";
  return KIND_TITLE[request.kind];
}

/** "Refund ₱185 · #14", "Refund overpayment ₱185 · #14" */
export function requestHeadline(
  request: Pick<ApprovalRequestView, "kind" | "amount" | "approvedAmount" | "orderNumber"> & { payload?: Record<string, unknown> | null },
): string {
  const amount = formatPesoShort(request.approvedAmount ?? request.amount);
  const on = request.orderNumber ? ` · ${request.orderNumber}` : "";
  return `${requestTitle(request)} ${amount}${on}`;
}

export type RequesterCardAction = "withdraw" | "print_again" | "done" | "ask_again" | "ask_again_with_changes" | "ok";
export type RequesterCardTone = "neutral" | "waiting" | "success" | "declined" | "closed";

export interface RequesterCard {
  tone: RequesterCardTone;
  title: string;
  subtitle: string | null;
  /** The decline reason chip and the approver's note, in their own words. */
  reasonChip: string | null;
  quote: string | null;
  showSpinner: boolean;
  actions: RequesterCardAction[];
  /** Countdown driving "expires 12:58 PM" (pending only). */
  countdown: Countdown | null;
}

export interface RequesterCardContext {
  now: Date;
  /** First names of the people asked (from the create response), owner last. */
  approverNames: readonly string[];
  /** The request is still being sent (no server answer yet). */
  isSending?: boolean;
  expiryMinutes?: number;
  /** False where no refund slip is printed: the card must not promise one. Default true. */
  canPrintSlip?: boolean;
}

function executedCopy(request: ApprovalRequestView): string {
  const amount = formatPesoShort(request.approvedAmount ?? request.amount);
  const who = firstName(request.decidedByName);
  const isCash = request.result?.cashInvolved === true;
  if (request.isDirect) {
    if (request.kind === "discount") return `Discount of ${amount} approved.`;
    if (request.kind === "stock_writeoff") return `Written off · ${amount} at cost.`;
    return isCash ? `Refunded ${amount}. Give it back from your drawer.` : `Refunded ${amount}.`;
  }
  switch (request.kind) {
    case "discount":
      return `Approved by ${who}. Apply the discount now.`;
    case "stock_writeoff":
      return `Approved by ${who}. Written off.`;
    default:
      return isCash
        ? `Approved by ${who}. Give ${amount} back from your drawer.`
        : `Approved by ${who}. ${amount} goes back the way they paid.`;
  }
}

/** The card pinned on the order screen while a request exists (design-spec §3.9). */
export function requesterCard(request: ApprovalRequestView | null, context: RequesterCardContext): RequesterCard {
  const base: RequesterCard = {
    tone: "neutral",
    title: "",
    subtitle: null,
    reasonChip: null,
    quote: null,
    showSpinner: false,
    actions: [],
    countdown: null,
  };

  if (context.isSending || !request) {
    return { ...base, title: `Sending to ${joinNames(context.approverNames, "and")}…`, showSpinner: true };
  }

  switch (request.status) {
    case "pending": {
      const left = countdown(request.expiresAt, context.now);
      if (left.isExpired) return requesterCard({ ...request, status: "expired" }, context);
      return {
        ...base,
        tone: "waiting",
        title: `Waiting for ${joinNames(context.approverNames, "or")}`,
        subtitle: `Asked ${timeAgo(request.createdAt, context.now)} · expires ${formatManilaClock(request.expiresAt)}`,
        actions: ["withdraw"],
        countdown: left,
      };
    }
    case "approved":
    case "executing":
      return { ...base, tone: "waiting", title: `Approved by ${firstName(request.decidedByName)} · finishing…`, showSpinner: true };
    case "executed": {
      const isMoney = request.kind === "refund" || request.kind === "cancel_paid";
      const printsSlip = isMoney && context.canPrintSlip !== false;
      return {
        ...base,
        tone: "success",
        title: executedCopy(request),
        subtitle: request.refundLabel ? `${request.refundLabel}${printsSlip ? " · refund slip printing" : ""}` : null,
        actions: printsSlip ? ["print_again", "done"] : ["done"],
      };
    }
    case "declined":
      return {
        ...base,
        tone: "declined",
        title: `${firstName(request.decidedByName)} said not this time`,
        reasonChip: declineReasonLabel(request.decisionReasonCode),
        quote: request.decisionNote,
        actions: ["ask_again_with_changes", "ok"],
      };
    case "expired":
      return {
        ...base,
        tone: "closed",
        title: `No answer in ${context.expiryMinutes ?? 30} min. The request closed.`,
        actions: ["ask_again"],
      };
    case "failed":
      return {
        ...base,
        tone: "closed",
        title: request.isDirect
          ? `It couldn't finish: ${request.error ?? "the order changed. Nothing was refunded."}`
          : "Approved, but it couldn't finish: the order changed. Nothing was refunded.",
        subtitle: request.isDirect ? null : request.error,
        actions: ["ask_again"],
      };
    case "withdrawn":
      return { ...base, tone: "closed", title: "Request withdrawn", actions: ["ask_again"] };
  }
}

export interface InboxCardLines {
  headline: string;
  detail: string;
  /** "8 min left" — only in the last 10 minutes. */
  timeLeftChip: string | null;
  /** "Over your ₱1,000 limit · sent to the owner" (read-only card). */
  overLimitNote: string | null;
}

/** One pending request in the approver's "To review" list (design-spec §3.6). */
export function inboxCardLines(request: ApprovalRequestView, now: Date): InboxCardLines {
  const left = countdown(request.expiresAt, now);
  return {
    headline: requestHeadline(request),
    detail: `${firstName(request.requestedByName)} · ${reasonLabel(request.kind, request.reasonCode)} · ${timeAgo(request.createdAt, now)}`,
    timeLeftChip: left.isUrgent ? left.label : null,
    overLimitNote:
      request.isOverViewerLimit && typeof request.viewerCap === "number"
        ? `Over your ${formatPesoShort(request.viewerCap)} limit · sent to the owner`
        : null,
  };
}

/** Is it worth polling again? (Realtime is primary; 10 s polling is the fallback.) */
export function shouldKeepPolling(request: ApprovalRequestView | null): boolean {
  return request !== null && (request.status === "pending" || request.status === "approved" || request.status === "executing");
}

export const POLL_INTERVAL_MS = 10_000;

/**
 * The approver's review screen (design-spec §3.7) as pure decisions: what the
 * header, amount card, items and "Worth knowing" say, and what the dock
 * offers. Everything is read from the request the server sent — its payload
 * and the PII-free order snapshot — never guessed.
 */
import { countdown, firstName, formatManilaClock, formatPesoShort, timeAgo } from "./state";
import type { ApprovalKind, ApprovalRequestView } from "./types";

type Json = Record<string, unknown>;

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_SIGNALS = 3;

const obj = (value: unknown): Json | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map(obj).filter((row): row is Json => row !== null) : []);
const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

const TITLES: Readonly<Record<ApprovalKind, string>> = {
  refund: "Refund request",
  cancel_paid: "Cancel paid order",
  discount: "Discount request",
  stock_writeoff: "Write-off request",
};

export function reviewTitle(kind: ApprovalKind): string {
  return TITLES[kind];
}

function snapshot(request: ApprovalRequestView): Json {
  return request.orderSnapshot ?? {};
}

function scope(request: ApprovalRequestView): string | null {
  return request.kind === "cancel_paid" ? "whole" : str(request.payload.scope);
}

/** "Order #14 · Dine in · placed 28 min ago" */
export function reviewSubtitle(request: ApprovalRequestView, now: Date): string {
  const snap = snapshot(request);
  const placed = str(snap.createdAt);
  return [
    request.orderNumber ? `Order ${request.orderNumber}` : null,
    str(snap.orderType),
    placed ? `placed ${timeAgo(placed, now)}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

function paidBy(tenders: Json[]): string | null {
  const names = tenders.filter((tender) => (num(tender.net) ?? 0) > 0).map((tender) => str(tender.methodName));
  if (names.length !== 1 || names[0] === null) return null;
  return /^cash\b/i.test(names[0]) ? "in cash" : `by ${names[0]}`;
}

/** "of ₱480 paid in cash · comes out of Ana's drawer" ("" when the snapshot says nothing). */
export function amountSubline(request: ApprovalRequestView): string {
  const ledger = obj(snapshot(request).ledger);
  const paid = num(ledger?.charged) ?? num(snapshot(request).total);
  if (paid === null || paid <= 0) return "";
  const how = paidBy(list(ledger?.tenders));
  const isCash = list(request.payload.allocation).some((part) => part.isCash === true);
  return [
    `of ${formatPesoShort(paid)} paid${how ? ` ${how}` : ""}`,
    isCash ? `comes out of ${firstName(request.requestedByName)}'s drawer` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

export interface ReviewItemLine {
  label: string;
  amount: string;
}

/** The pieces being refunded: from payload.lines (items) or every line (whole). */
export function reviewItemLines(request: ApprovalRequestView): ReviewItemLine[] {
  const items = list(snapshot(request).items);
  const which = scope(request);
  if (which === "whole") {
    return items.map((item) => ({
      label: `${num(item.quantity) ?? 0} × ${str(item.name) ?? "Item"}`,
      amount: formatPesoShort(num(item.lineTotal) ?? 0),
    }));
  }
  if (which !== "items") return [];
  return list(request.payload.lines).map((line) => {
    const item = items.find((candidate) => candidate.id === line.orderItemId);
    const quantity = num(line.quantity) ?? 0;
    const pieces = num(item?.quantity) ?? 0;
    const unit = pieces > 0 ? (num(item?.lineTotal) ?? 0) / pieces : 0;
    return { label: `${quantity} × ${str(item?.name) ?? "Item"}`, amount: formatPesoShort(unit * quantity) };
  });
}

/** What happens to the stock (null when no items move: an amount refund). */
export function stockLine(request: ApprovalRequestView): string | null {
  if (request.kind !== "refund" && request.kind !== "cancel_paid") return null;
  if (scope(request) === "amount") return null;
  return request.payload.restock === true ? "Put back in stock" : "Not put back in stock · logged as waste";
}

export function requesterSubline(request: ApprovalRequestView, now: Date): string {
  return `Asked ${timeAgo(request.createdAt, now)}`;
}

export function expiryLine(request: ApprovalRequestView, now: Date): string | null {
  if (request.status !== "pending") return null;
  const left = countdown(request.expiresAt, now);
  if (left.isExpired) return null;
  return `Expires in ${left.minutesLeft} min if nobody answers`;
}

function decidedAmount(request: ApprovalRequestView): number {
  return request.approvedAmount ?? request.amount;
}

export function approveSlideLabel(request: ApprovalRequestView): string {
  return `Slide to approve ${formatPesoShort(request.amount)}`;
}

export function approveA11yLabel(request: ApprovalRequestView): string {
  const centavos = Math.round(request.amount * 100);
  const pesos = centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2);
  return `Approve ${pesos} ${centavos === 100 ? "peso" : "pesos"}`;
}

/** The server accepts amountOverride on amount refunds only (≤ requested). */
export function canChangeAmount(request: ApprovalRequestView): boolean {
  return request.canDecide && request.kind === "refund" && scope(request) === "amount";
}

export interface ReviewSignal {
  tone: "ok" | "check";
  text: string;
}

const manilaDay = (at: number): string => new Date(at + MANILA_OFFSET_MS).toISOString().slice(0, 10);

/** "Worth knowing": at most three, the ones worth checking first. */
export function reviewSignals(request: ApprovalRequestView, now: Date): ReviewSignal[] {
  const snap = snapshot(request);
  const refunded = num(obj(snap.ledger)?.refunded) ?? 0;
  const revisions = num(snap.revisionNumber) ?? 0;
  const placed = str(snap.createdAt);
  const checks: (string | null)[] = [
    refunded > 0 ? `${formatPesoShort(refunded)} was already refunded on this order` : null,
    revisions > 0 ? `This order was edited ${revisions === 1 ? "once" : `${revisions} times`} before` : null,
    placed && manilaDay(Date.parse(placed)) !== manilaDay(now.getTime()) ? "This order is from an earlier day" : null,
    request.kind === "refund" && scope(request) === "whole" ? "The whole order will be cancelled" : null,
  ];
  const cap = request.viewerCap;
  const oks: (string | null)[] = [
    typeof cap === "number" && request.amount <= cap ? `Within your ${formatPesoShort(cap)} limit` : null,
  ];
  return [
    ...checks.filter((text): text is string => text !== null).map((text) => ({ tone: "check" as const, text })),
    ...oks.filter((text): text is string => text !== null).map((text) => ({ tone: "ok" as const, text })),
  ].slice(0, MAX_SIGNALS);
}

export type ReviewDock =
  | { kind: "decide" }
  | { kind: "offline"; text: string }
  | { kind: "waiting"; title: string; text: string }
  | { kind: "busy"; text: string }
  | { kind: "done"; tone: "success" | "neutral" | "danger"; text: string; detail: string | null };

export interface ReviewDockContext {
  isOffline: boolean;
  viewerUserId: string | null;
  now: Date;
}

function pendingDock(request: ApprovalRequestView, ctx: ReviewDockContext): ReviewDock {
  if (request.canDecide) return ctx.isOffline ? { kind: "offline", text: "You're offline. Connect to approve." } : { kind: "decide" };
  if (request.isOverViewerLimit) {
    const cap = typeof request.viewerCap === "number" ? `your ${formatPesoShort(request.viewerCap)} limit` : "your limit";
    return { kind: "waiting", title: "Waiting for the owner", text: `Over ${cap}. The owner has been asked.` };
  }
  if (request.requestedBy === ctx.viewerUserId) {
    return { kind: "waiting", title: "Waiting for an answer", text: "You can't approve your own request." };
  }
  return { kind: "waiting", title: "Waiting for an answer", text: "Your account can't answer this one." };
}

/** What the bottom dock shows for this request and viewer. */
export function reviewDock(request: ApprovalRequestView, ctx: ReviewDockContext): ReviewDock {
  const requester = firstName(request.requestedByName);
  const decider = firstName(request.decidedByName);
  const isMine = request.decidedBy !== null && request.decidedBy === ctx.viewerUserId;
  const at = request.decidedAt ? ` at ${formatManilaClock(request.decidedAt)}` : "";
  switch (request.status) {
    case "pending":
      return pendingDock(request, ctx);
    case "approved":
    case "executing":
      return { kind: "busy", text: `Approved by ${decider} · finishing…` };
    case "executed":
      return isMine
        ? { kind: "done", tone: "success", text: `Approved. ${requester} can give back ${formatPesoShort(decidedAmount(request))} now.`, detail: request.refundLabel }
        : { kind: "done", tone: "neutral", text: `${decider} already approved this${at}`, detail: request.refundLabel };
    case "declined":
      return isMine
        ? { kind: "done", tone: "neutral", text: `Declined. ${requester} has been told.`, detail: null }
        : { kind: "done", tone: "neutral", text: `${decider} declined this${at}`, detail: null };
    case "expired":
      return { kind: "done", tone: "neutral", text: "This request expired", detail: null };
    case "withdrawn":
      return { kind: "done", tone: "neutral", text: `${requester} withdrew this request`, detail: null };
    case "failed":
      return {
        kind: "done",
        tone: "danger",
        text: `Couldn't finish: the order changed since ${requester} asked. Nothing was refunded.`,
        detail: null,
      };
  }
}

/**
 * After Approve / Decline on a push, the app re-reads the request first
 * (design-spec §3.12): "go" only when a fresh read says it is still pending
 * and this person may decide; otherwise the screen just shows what is true.
 */
export function pushIntentStep(
  request: ApprovalRequestView | undefined,
  context: { isFresh: boolean; isOffline: boolean },
): "wait" | "go" | "drop" {
  if (!request || !context.isFresh) return "wait";
  return request.status === "pending" && request.canDecide && !context.isOffline ? "go" : "drop";
}

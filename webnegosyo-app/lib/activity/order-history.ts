/**
 * One order's history as a timeline (design spec §3.5).
 *
 * Unlike the feed (an inbox, newest first) a timeline is read as a story, so
 * it runs oldest at the top. Every node carries a word and a shape as well as
 * a colour: ● green "Paid", ◆ amber "Edited"/"Requested", ✕ red
 * "Cancelled"/"Refunded", ○ grey for the rest.
 */

import { actorFirstName, describeActivity } from "./describe";
import { formatManilaTime } from "./format";
import type { StoreActivityEvent } from "./store-event";
import type { ActivityKind } from "./taxonomy";

export type TimelineShape = "dot" | "diamond" | "cross" | "ring";
export type TimelineTone = "success" | "warning" | "danger" | "neutral";

export interface TimelineNode {
  id: string;
  title: string;
  /** "12:11 PM · Ana" */
  meta: string;
  reason: string | null;
  word: string;
  shape: TimelineShape;
  tone: TimelineTone;
  amountLabel: string | null;
}

interface NodeLook {
  word: string;
  shape: TimelineShape;
  tone: TimelineTone;
}

const PAID: NodeLook = { word: "Paid", shape: "dot", tone: "success" };

const LOOKS: Partial<Readonly<Record<ActivityKind, NodeLook>>> = {
  "payment.recorded": PAID,
  "payment.marked_paid": PAID,
  "payment.charged": PAID,
  "payment.proof_approved": PAID,
  "order.edited": { word: "Edited", shape: "diamond", tone: "warning" },
  "discount.applied": { word: "Discount", shape: "diamond", tone: "warning" },
  "approval.requested": { word: "Requested", shape: "diamond", tone: "warning" },
  "order.cancelled": { word: "Cancelled", shape: "cross", tone: "danger" },
  "refund.issued": { word: "Refunded", shape: "cross", tone: "danger" },
  "order.deleted": { word: "Deleted", shape: "cross", tone: "danger" },
};

const NEUTRAL_WORDS: Partial<Readonly<Record<ActivityKind, string>>> = {
  "order.placed": "Placed",
  "order.completed": "Completed",
  "order.reopened": "Reopened",
  "receipt.reprinted": "Reprinted",
  "voucher.redeemed": "Voucher",
};

function byOccurredAsc(a: StoreActivityEvent, b: StoreActivityEvent): number {
  return a.occurredAt === b.occurredAt ? a.id.localeCompare(b.id) : a.occurredAt.localeCompare(b.occurredAt);
}

function lookOf(kind: ActivityKind): NodeLook {
  return LOOKS[kind] ?? { word: NEUTRAL_WORDS[kind] ?? "Updated", shape: "ring", tone: "neutral" };
}

export function toTimelineNodes(events: readonly StoreActivityEvent[]): TimelineNode[] {
  return [...events].sort(byOccurredAsc).map((event) => {
    const described = describeActivity(event);
    const who = actorFirstName(event.actorName);
    return {
      id: event.id,
      title: described.title,
      meta: [formatManilaTime(event.occurredAt), who].filter((part): part is string => Boolean(part)).join(" · "),
      reason: event.reason,
      amountLabel: described.amountLabel,
      ...lookOf(event.kind),
    };
  });
}

export interface TimelineView {
  visible: TimelineNode[];
  hiddenCount: number;
}

/** The latest `collapsedCount` nodes (the end of the story) until expanded. */
export function collapseTimeline(
  nodes: readonly TimelineNode[],
  options: { collapsedCount: number; isExpanded: boolean },
): TimelineView {
  if (options.isExpanded || nodes.length <= options.collapsedCount) return { visible: [...nodes], hiddenCount: 0 };
  return { visible: nodes.slice(nodes.length - options.collapsedCount), hiddenCount: nodes.length - options.collapsedCount };
}

/** A request is open while the latest approval event is the request itself. */
export function hasOpenRequest(events: readonly StoreActivityEvent[]): boolean {
  const approvals = [...events].sort(byOccurredAsc).filter((event) => event.category === "approvals");
  const last = approvals[approvals.length - 1];
  return last !== undefined && last.kind === "approval.requested";
}

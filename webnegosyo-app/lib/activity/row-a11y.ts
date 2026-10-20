/**
 * What a screen reader says for one activity row, and who may see what.
 *
 * Each row is ONE accessible element (design spec §3.1), so its label is the
 * whole sentence a sighted merchant reads across two lines and the right
 * column: "Money. Ana refunded order 14, minus 185 pesos. Wrong item, approved
 * by Marco. 12:33 PM. Needs a look: …". "#14" is spoken as "order 14", and a
 * money-out amount says "minus" because the colour it wears is not read out.
 */

import type { DescribedActivity } from "./describe";
import { formatManilaTime } from "./format";
import type { StoreActivityEvent } from "./store-event";
import { CATEGORY_LABELS, FLAG_COPY } from "./taxonomy";
import { hasPermission, type StaffPermissionHolder } from "../staff-permissions";

export interface ActivityAccess {
  isOwner: boolean;
  /** Owner, activity_view or approve_requests: the store's rows and their flags. */
  isFullViewer: boolean;
  /** May decide requests (Phase 3) and mark flags reviewed. */
  isApprover: boolean;
}

/** Mirrors the server's scope (store_activity_caller_scope); the server still decides. */
export function activityAccess(caller: StaffPermissionHolder): ActivityAccess {
  const isOwner = caller.role === "superadmin" || caller.isOwner;
  const isApprover = hasPermission(caller, "approve_requests");
  return { isOwner, isApprover, isFullViewer: isApprover || hasPermission(caller, "activity_view") };
}

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function spokenPesos(amount: number): string {
  const centavos = Math.round(Math.abs(amount) * 100);
  const whole = groupThousands(String(Math.floor(centavos / 100)));
  const cents = centavos % 100;
  const digits = cents === 0 ? whole : `${whole}.${String(cents).padStart(2, "0")}`;
  const unit = centavos === 100 ? "peso" : "pesos";
  return `${amount < 0 ? "minus " : ""}${digits} ${unit}`;
}

function spokenOrders(text: string): string {
  return text.replace(/#(\d+)/g, "order $1");
}

function flagSentence(event: StoreActivityEvent): string | null {
  if (event.flags.length === 0) return null;
  if (event.reviewedAt !== null) return "Reviewed.";
  return `Needs a look: ${event.flags.map((flag) => FLAG_COPY[flag].explanation).join(" ")}`;
}

export function activityRowLabel(event: StoreActivityEvent, described: DescribedActivity): string {
  const lead = event.amount === null ? described.title : `${described.title}, ${spokenPesos(event.amount)}`;
  const detail = described.subtitle.split(" · ").filter((part) => part !== "").join(", ");
  const time = formatManilaTime(event.occurredAt);
  return [
    `${CATEGORY_LABELS[event.category]}.`,
    `${spokenOrders(lead)}.`,
    detail ? `${spokenOrders(detail)}.` : null,
    time ? `${time}.` : null,
    flagSentence(event),
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}

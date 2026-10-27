/**
 * Approval pushes on the phone — pure. The notification categories the app
 * registers (their ids match src/lib/approvals/push.ts `categoryId`), the
 * Android channel id, and where a tapped push or action lands. The root
 * layout's tap handler is a thin shell around `routeFromPushResponse`, the
 * app's ONE push router. Order: approvals, approval batches, then the
 * merchant-notification router (announcements, stock alerts, then bill
 * reminders), then texting (texts waiting, a campaign's send reminder).
 *
 * Design-spec §0.1 / §3.12: Approve must OPEN the app on both platforms (an
 * Android background action runs with the phone still locked) and require the
 * device unlock on iOS; the app then shows a 4-second Undo before sending.
 */
import { routeFromPushData } from "../merchant-notifications/push-route";
import { textingRouteFromPushData } from "../sms-automations/push-route";

export const APPROVALS_CHANNEL_ID = "approvals";
export const APPROVAL_CATEGORY_WITHIN_LIMIT = "approval_within_limit";
export const APPROVE_ACTION = "approve";
export const DECLINE_ACTION = "decline";

export const APPROVAL_ROUTE = "/(main)/approval";
export const ACTIVITY_REVIEW_HREF = "/(main)/activity?tab=review";

export interface PushActionOptions {
  opensAppToForeground: boolean;
  isAuthenticationRequired?: boolean;
  isDestructive?: boolean;
}

export interface PushCategory {
  identifier: string;
  actions: { identifier: string; buttonTitle: string; options: PushActionOptions }[];
}

/**
 * Only the within-limit request carries actions. Over-limit, results and
 * batches open the app on tap (the HIG says not to add actions that only
 * open the app), so they need no registration.
 */
export function APPROVAL_PUSH_CATEGORIES(platform: "ios" | "android" | string): PushCategory[] {
  const approve: PushActionOptions =
    platform === "ios" ? { opensAppToForeground: true, isAuthenticationRequired: true } : { opensAppToForeground: true };
  return [
    {
      identifier: APPROVAL_CATEGORY_WITHIN_LIMIT,
      actions: [
        { identifier: APPROVE_ACTION, buttonTitle: "Approve", options: approve },
        { identifier: DECLINE_ACTION, buttonTitle: "Decline…", options: { opensAppToForeground: true, isDestructive: true } },
      ],
    },
  ];
}

export type ApprovalIntent = "approve" | "decline";

export interface ApprovalPushTarget {
  approvalId: string;
  /** Set only by an action button on a request push. */
  intent: ApprovalIntent | null;
}

const REQUEST_TYPES = new Set(["approval_request", "approval_result"]);

function readData(data: unknown): Record<string, unknown> | null {
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
}

/** The request a push points at (and the action pressed), or null when it is not one. */
export function approvalTargetFromPush(data: unknown, actionIdentifier: string | null): ApprovalPushTarget | null {
  const payload = readData(data);
  if (!payload || typeof payload.type !== "string" || !REQUEST_TYPES.has(payload.type)) return null;
  if (typeof payload.approvalId !== "string" || payload.approvalId === "") return null;
  const isRequest = payload.type === "approval_request";
  const intent: ApprovalIntent | null =
    isRequest && actionIdentifier === APPROVE_ACTION ? "approve" : isRequest && actionIdentifier === DECLINE_ACTION ? "decline" : null;
  return { approvalId: payload.approvalId, intent };
}

export function approvalHref(target: ApprovalPushTarget): string {
  const base = `${APPROVAL_ROUTE}/${encodeURIComponent(target.approvalId)}`;
  return target.intent ? `${base}?intent=${target.intent}` : base;
}

/** Where a tapped push (or one of its actions) opens; null leaves it to the order screens. */
export function routeFromPushResponse(data: unknown, actionIdentifier: string | null): string | null {
  const target = approvalTargetFromPush(data, actionIdentifier);
  if (target) return approvalHref(target);
  if (readData(data)?.type === "approval_batch") return ACTIVITY_REVIEW_HREF;
  return routeFromPushData(data) ?? textingRouteFromPushData(data);
}

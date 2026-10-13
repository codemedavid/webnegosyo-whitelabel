/**
 * The merchant app's client for `POST /api/sms/automations` — one action per
 * call, same fetch discipline as the loyalty routes (`callLoyaltyApi`: the
 * session read and the request share one deadline, never throws).
 *
 * The server owns every rule and every word of refusal; this file only shapes
 * the answers. The shapes mirror src/lib/sms-automations/api/{reads,writes}.ts.
 */

import { callLoyaltyApi } from "../loyalty/repo";

export type RecipeId =
  | "review_request"
  | "first_visit_followup"
  | "loyalty_almost_there"
  | "loyalty_reward_waiting"
  | "loyalty_reward_expiring"
  | "win_back"
  | "regulars_gone_quiet";

export type ParamKey = "delayHours" | "delayDays" | "inactiveDays" | "remainingAtMost" | "minOrderCount";
export type AutomationParams = Partial<Record<ParamKey, number>>;
export type RunMode = "auto" | "manual";
export type AutomationStatus = "on" | "off";
export type OutboxStatus = "queued" | "claimed" | "sent" | "failed" | "cancelled" | "expired" | "skipped";

export interface RecipeInfo {
  id: RecipeId;
  moment: "after_visit" | "loyalty" | "bring_back";
  title: string;
  pitch: string;
  defaults: AutomationParams;
  limits: Partial<Record<ParamKey, [number, number]>>;
  defaultReentryDays: number;
  needsLoyalty: boolean;
  needsReviewLink: boolean;
  defaultMessage: string;
  defaultMessageTl: string;
  variables: string[];
  description: string;
}

export interface AutomationStats {
  waiting: number;
  sent30d: number;
  skipped30d: number;
  lastSentAt: string | null;
}

export interface Automation {
  id: string;
  recipe: RecipeId;
  name: string;
  description: string;
  params: AutomationParams;
  messageTemplate: string;
  runMode: RunMode;
  reentryDays: number | null;
  status: AutomationStatus;
  source: "owner" | "ai" | "onboarding";
  updatedAt: string;
  stats: AutomationStats;
}

export interface TextingRules {
  quietHoursStart: string;
  quietHoursEnd: string;
  guestCapDays: number;
  dailyLimit: number;
  optOutLine: string | null;
  reviewUrl: string | null;
}

export interface SenderStatus {
  enrolled: number;
  online: boolean;
  lastSeenAt: string | null;
}

export interface DeliveryOutlook {
  waiting: number;
  sentToday: number;
  dailyLimit: number;
  finishAt: string | null;
}

export interface AutomationsView {
  automations: Automation[];
  recipes: RecipeInfo[];
  settings: TextingRules;
  sender: SenderStatus;
  outlook: DeliveryOutlook;
  loyaltyOn: boolean;
}

export interface AutomationDraft {
  recipe: RecipeId;
  name?: string;
  params?: AutomationParams;
  messageTemplate: string;
  runMode?: RunMode;
  reentryDays?: number | null;
}

export interface PlanReport {
  qualifying: number;
  queued: number;
  skipped: Partial<Record<string, number>>;
  sample: string[];
}

export interface AutomationPreview {
  audience: { withPhone: number; textable: number };
  now: PlanReport | null;
  justQualified: number;
  sampleText: string | null;
  outlook: DeliveryOutlook;
}

export interface BacklogResult {
  queued: number;
  report: PlanReport | null;
  outlook: DeliveryOutlook;
}

export interface ActivityItem {
  id: string;
  automationId: string | null;
  recipe: RecipeId;
  guestName: string | null;
  phoneLast4: string;
  body: string;
  status: OutboxStatus;
  reason: string | null;
  source: "auto" | "run_now";
  notBefore: string;
  createdAt: string;
  sentAt: string | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: string; code: string | null };

const PATH = "/api/sms/automations";
const OFFLINE = "Could not reach the server. Check your connection and try again.";

async function call<T>(tenantId: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
  const response = await callLoyaltyApi(PATH, "POST", { tenantId, body });
  if (response.status === 200 && response.body && response.body.success === true) {
    return { ok: true, value: response.body as unknown as T };
  }
  const error = typeof response.body?.error === "string" ? response.body.error : OFFLINE;
  const code = typeof response.body?.code === "string" ? response.body.code : null;
  return { ok: false, error, code };
}

export const automationsApi = {
  list: (tenantId: string) => call<AutomationsView>(tenantId, { action: "list" }),
  save: (tenantId: string, automation: AutomationDraft) =>
    call<{ id: string; created: boolean }>(tenantId, { action: "save", automation }),
  preview: (tenantId: string, automation: AutomationDraft) =>
    call<AutomationPreview>(tenantId, { action: "preview", automation }),
  setStatus: (tenantId: string, automationId: string, status: AutomationStatus, sendBacklog = false) =>
    call<{ status: AutomationStatus; backlog: BacklogResult | null }>(tenantId, { action: "set_status", automationId, status, sendBacklog }),
  runNow: (tenantId: string, automationId: string) => call<BacklogResult>(tenantId, { action: "run_now", automationId }),
  saveRules: (tenantId: string, settings: TextingRules) =>
    call<{ settings: TextingRules }>(tenantId, { action: "save_settings", settings }),
  cancelWaiting: (tenantId: string, automationId?: string) =>
    call<{ cancelled: number }>(tenantId, { action: "cancel_waiting", ...(automationId ? { automationId } : {}) }),
  activity: (tenantId: string, query: { cursor?: string; status?: OutboxStatus; automationId?: string; limit?: number } = {}) =>
    call<ActivityPage>(tenantId, { action: "activity", ...query }),
};

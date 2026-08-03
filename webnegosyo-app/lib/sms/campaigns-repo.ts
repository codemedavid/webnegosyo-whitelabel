/**
 * Persistence for campaigns, their runs, and every message sent.
 *
 * `claimRun` is the important one. A store can have two devices signed in, both
 * polling, both seeing the same run come due. The claim is expressed as a
 * conditional update — `update ... where id = ? and claimed_by_device is null`
 * — so Postgres decides the winner in one statement. A read-then-write would
 * let both devices read null and both proceed, texting every guest twice, and
 * no amount of care in the calling code fixes that.
 *
 * It also fails CLOSED: a claim that errors returns false. Sending on a claim
 * we are not sure we hold is worse than not sending.
 */

import { supabase } from "../supabase";
import type { CampaignDraft } from "./campaign-form";
import type { CampaignStatus, ScheduledCampaign } from "./due-runs";
import type { RunFinishStatus } from "./run-orchestrator";
import type { ScheduleKind, SmsSendRecord } from "./types";

const CAMPAIGN_COLUMNS =
  "id, name, status, message_template, audience, schedule_kind, schedule_time, " +
  "schedule_date, schedule_interval_days, schedule_weekdays, quiet_hours_start, " +
  "quiet_hours_end, max_per_run, created_at";

const CAMPAIGN_STATUSES: readonly CampaignStatus[] = ["draft", "active", "paused", "archived"];
const SCHEDULE_KINDS: readonly ScheduleKind[] = ["one_off", "every_n_days", "weekly"];

/**
 * A status this build does not recognise resolves to `archived`, never
 * `active`: a row written by a newer app must not start texting people from an
 * older one that cannot understand what it says.
 */
function toStatus(raw: unknown): CampaignStatus {
  return CAMPAIGN_STATUSES.includes(raw as CampaignStatus)
    ? (raw as CampaignStatus)
    : "archived";
}

function toScheduleKind(raw: unknown): ScheduleKind {
  return SCHEDULE_KINDS.includes(raw as ScheduleKind) ? (raw as ScheduleKind) : "one_off";
}

export interface CampaignRow {
  id: string;
  name: string;
  status: string;
  message_template: string;
  audience: unknown;
  schedule_kind: string;
  schedule_time: string;
  schedule_date: string | null;
  schedule_interval_days: number | null;
  schedule_weekdays: number[] | null;
  quiet_hours_start: string;
  quiet_hours_end: string;
  max_per_run: number;
  created_at: string;
}

/** Row + its most recent completed run, mapped for `due-runs.ts`. */
export function toScheduledCampaign(
  row: CampaignRow | Record<string, unknown>,
  lastRunAt: string | null
): ScheduledCampaign {
  const r = row as CampaignRow;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    status: toStatus(r.status),
    createdAt: new Date(r.created_at),
    lastRunAt: lastRunAt ? new Date(lastRunAt) : null,
    schedule: {
      scheduleKind: toScheduleKind(r.schedule_kind),
      scheduleTime: r.schedule_time ?? "10:00",
      scheduleDate: r.schedule_date ?? null,
      scheduleIntervalDays: r.schedule_interval_days ?? null,
      scheduleWeekdays: Array.isArray(r.schedule_weekdays) ? r.schedule_weekdays : [],
      quietHoursStart: r.quiet_hours_start ?? "21:00",
      quietHoursEnd: r.quiet_hours_end ?? "08:00",
    },
  };
}

function draftToRow(draft: CampaignDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    message_template: draft.messageTemplate,
    audience: draft.audience,
    schedule_kind: draft.scheduleKind,
    schedule_time: draft.scheduleTime,
    schedule_date: draft.scheduleDate,
    schedule_interval_days: draft.scheduleIntervalDays,
    schedule_weekdays: draft.scheduleWeekdays,
    quiet_hours_start: draft.quietHoursStart,
    quiet_hours_end: draft.quietHoursEnd,
    max_per_run: draft.maxPerRun,
  };
}

export async function listCampaignRows(tenantId: string): Promise<CampaignRow[]> {
  const { data, error } = await supabase
    .from("sms_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CampaignRow[];
}

/**
 * Write a new campaign and hand back its id.
 *
 * **Saved live, not as a draft.** The column default is `draft`, and
 * `computeCampaignDueStates` only ever marks an ACTIVE campaign due — so a
 * campaign written without a status sits there forever: never due, never
 * announced, never sent, with nothing on screen explaining why. A merchant who
 * filled in a schedule has already said what they want. Retiring a campaign is
 * still explicit, via pause or archive.
 *
 * The id is returned because the editor needs somewhere to go: its Send block
 * renders only for a campaign that has one.
 */
export async function createCampaign(
  tenantId: string,
  draft: CampaignDraft
): Promise<string> {
  const { data, error } = await supabase
    .from("sms_campaigns")
    .insert({ tenant_id: tenantId, status: "active", ...draftToRow(draft) })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // An insert that comes back with no row is not a success with a missing
  // detail — the editor would navigate to a campaign that may not exist, and
  // report a save that cannot be proven. Fail where it happened.
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw new Error("The campaign was not saved. Try again.");

  return id;
}

export async function updateCampaign(id: string, draft: CampaignDraft): Promise<void> {
  const { error } = await supabase.from("sms_campaigns").update(draftToRow(draft)).eq("id", id);

  if (error) throw new Error(error.message);
}

export async function setCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
  const { error } = await supabase.from("sms_campaigns").update({ status }).eq("id", id);

  if (error) throw new Error(error.message);
}

/**
 * Find or create the run row for one due occurrence.
 *
 * `(campaign_id, due_at)` is unique, so two devices computing the same
 * occurrence converge on one row rather than creating two runs of the same
 * campaign. Whoever then wins `claimRun` is the one that sends.
 */
export async function ensureRun(
  tenantId: string,
  campaignId: string,
  dueAt: Date
): Promise<string | null> {
  const dueAtIso = dueAt.toISOString();

  await supabase
    .from("sms_campaign_runs")
    .upsert(
      { tenant_id: tenantId, campaign_id: campaignId, due_at: dueAtIso },
      { onConflict: "campaign_id,due_at", ignoreDuplicates: true }
    );

  const { data, error } = await supabase
    .from("sms_campaign_runs")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("due_at", dueAtIso)
    .limit(1);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string }[];
  return rows[0]?.id ?? null;
}

/** Conditional claim; see the module comment. Fails closed. */
export async function claimRun(runId: string, deviceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("sms_campaign_runs")
    .update({
      claimed_by_device: deviceId,
      claimed_at: new Date().toISOString(),
      status: "running",
      started_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .is("claimed_by_device", null)
    .select("id");

  if (error) return false;
  return ((data ?? []) as unknown[]).length > 0;
}

export async function listSentCustomerIds(runId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("sms_sends")
    .select("customer_id")
    .eq("run_id", runId);

  if (error) throw new Error(error.message);

  return ((data ?? []) as { customer_id: string | null }[])
    .map((row) => row.customer_id)
    .filter((id): id is string => typeof id === "string" && id !== "");
}

export async function recordSend(
  tenantId: string,
  runId: string,
  record: SmsSendRecord
): Promise<void> {
  const { error } = await supabase.from("sms_sends").insert({
    tenant_id: tenantId,
    run_id: runId,
    customer_id: record.customerId,
    phone_e164: record.phoneE164,
    message_body: record.messageBody,
    result: record.result,
    error_code: record.errorCode ?? null,
    error_message: record.errorMessage ?? null,
    sent_at: record.sentAt,
  });

  if (error) throw new Error(error.message);
}

/**
 * Close a run, or deliberately leave it open.
 *
 * `partial` returns the run to `pending` and clears the claim: recipients are
 * still waiting, so the next poll must be able to pick it up again. Only a run
 * that reached everyone is stamped completed.
 */
export async function finishRun(runId: string, status: RunFinishStatus): Promise<void> {
  const isComplete = status === "completed";
  const { error } = await supabase
    .from("sms_campaign_runs")
    .update({
      status: isComplete ? "completed" : "pending",
      completed_at: isComplete ? new Date().toISOString() : null,
      claimed_by_device: isComplete ? undefined : null,
    })
    .eq("id", runId);

  if (error) throw new Error(error.message);
}

/** The most recent completed run per campaign, for due-ness anchoring. */
export async function lastRunAtByCampaign(
  tenantId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("sms_campaign_runs")
    .select("campaign_id, completed_at")
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  if (error) throw new Error(error.message);

  const latest: Record<string, string> = {};
  for (const row of (data ?? []) as { campaign_id: string; completed_at: string | null }[]) {
    if (!row.completed_at) continue;
    if (!latest[row.campaign_id]) latest[row.campaign_id] = row.completed_at;
  }
  return latest;
}

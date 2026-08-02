/**
 * Shared types for the SMS follow-up campaign domain.
 *
 * Everything here is plain data. The domain modules beside this file are pure —
 * no React, no Supabase, no native — which is what lets the whole send pipeline
 * be tested without a handset, mirroring `lib/growth-metrics.ts`.
 */

/** A customer as `public.customers` hands them over, narrowed to what SMS needs. */
export interface SmsCustomer {
  id: string;
  name: string | null;
  phone_e164: string | null;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
  channels_used: string[];
  /** Explicit opt-in captured at checkout. */
  sms_consent: boolean;
  /** Asked to be left alone. Beats consent, always. */
  sms_opt_out: boolean;
}

/** The `sms_campaigns.audience` jsonb blob. Every field is optional; all AND together. */
export interface AudienceFilter {
  /** Win-back: last order strictly older than this many days. */
  lastOrderOlderThanDays?: number;
  /** Recency: last order within this many days. */
  lastOrderWithinDays?: number;
  minOrderCount?: number;
  minTotalSpent?: number;
  /** Match if the customer has used ANY of these channels. */
  channels?: string[];
}

export type ExclusionReason =
  | "no_phone"
  | "no_consent"
  | "opted_out"
  | "suppressed"
  | "recently_texted"
  | "filter";

export interface AudienceExclusion {
  customerId: string;
  reason: ExclusionReason;
}

export interface AudienceContext {
  /** Evaluation instant; injected so the selection is deterministic in tests. */
  now: string | Date;
  /** Do-not-text numbers (`sms_suppressions`). */
  suppressedPhones?: readonly string[];
  /** Numbers already texted inside the cross-campaign cooldown. */
  recentlyTextedPhones?: readonly string[];
}

export interface AudienceResult {
  recipients: SmsCustomer[];
  excluded: AudienceExclusion[];
  /** Counts per reason, for the pre-send review screen. Always has every key. */
  summary: Record<ExclusionReason, number>;
}

export type ScheduleKind = "one_off" | "every_n_days" | "weekly";

/** The scheduling half of an `sms_campaigns` row. */
export interface SmsCampaignSchedule {
  scheduleKind: ScheduleKind;
  /** Local Manila wall clock, "HH:MM". */
  scheduleTime: string;
  /** one_off only: "YYYY-MM-DD". */
  scheduleDate: string | null;
  /** every_n_days only. */
  scheduleIntervalDays: number | null;
  /** weekly only: ISO weekdays, 1=Mon .. 7=Sun. */
  scheduleWeekdays: number[];
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface NextDueContext {
  /** Find the first occurrence strictly after this instant. */
  after: Date;
  lastRunAt?: Date | null;
  createdAt?: Date | null;
}

export interface RunPlanOptions {
  alreadySentCustomerIds: readonly string[];
  maxPerRun: number;
}

export interface RunPlan {
  /** Recipients to text in this run, in audience order. */
  batch: SmsCustomer[];
  /** Eligible recipients held back by the cap; they roll into the next run. */
  deferred: SmsCustomer[];
  alreadySentCount: number;
  /** True when nothing is left over after this batch. */
  isComplete: boolean;
}

export type SendResultStatus = "sent" | "failed" | "skipped";

/** One row destined for `sms_sends`. */
export interface SmsSendRecord {
  customerId: string;
  phoneE164: string;
  messageBody: string;
  result: SendResultStatus;
  sentAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface SendRunDeps {
  /** Hands one message to the phone. Rejects with a `code` on radio failure. */
  sendSms(phoneE164: string, body: string): Promise<void>;
  /** Persists the audit row. Must be durable before the next message is sent. */
  recordSend(record: SmsSendRecord): Promise<void>;
  wait(ms: number): Promise<void>;
  now(): string;
  /** Gap between messages; keeps the run under Android's silent throttle. */
  staggerMs: number;
  /** Polled between messages so the merchant can stop a run in flight. */
  shouldAbort?(): boolean;
}

export interface SendRunContext {
  template: string;
  storeName: string;
}

/** Why a run stopped before working through its batch. */
export type HaltReason = "rate_limited" | "aborted" | "log_failed";

export interface RunOutcome {
  results: SmsSendRecord[];
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  haltedReason: HaltReason | null;
}

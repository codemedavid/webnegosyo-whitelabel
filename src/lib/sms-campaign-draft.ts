/**
 * Validate and shape an SMS campaign written from the provisioning/MCP surface.
 *
 * Every rule mirrors a CHECK constraint on `public.sms_campaigns` (migrations
 * 20260816120000 and ...130000). The duplication is deliberate: a constraint
 * violation reaches an AI caller as an opaque Postgres error it cannot act on,
 * while a Zod failure names the offending field and can be corrected.
 *
 * The schedule-fields rule is the one that bites. Each `schedule_kind` must
 * carry the field that steers it — a weekly campaign with no weekdays, or a
 * one-off with no date, gives the due-date computation nothing to work from, so
 * the campaign simply never fires while continuing to look scheduled.
 *
 * TWO POLICY DECISIONS LIVE HERE.
 *
 * Campaigns default to DRAFT. The merchant app deliberately saves them LIVE
 * (see `webnegosyo-app/lib/sms/campaigns-repo.ts`) because a merchant who filled
 * in a schedule has already said what they want. A tool call has not: an AI must
 * not be able to text a restaurant's real customers unattended. A caller that
 * genuinely means it can still pass `status: 'active'`.
 *
 * And nothing here writes consent, opt-out, or suppression. Consent is captured
 * from the customer at checkout and must be a real boolean they produced — a
 * provisioning tool that could manufacture it would turn the whole opt-in record
 * into decoration.
 */

import { z } from 'zod'

/** "HH:MM" on a 24-hour clock, local Asia/Manila wall time. */
const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/
/** "YYYY-MM-DD". */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const SCHEDULE_KINDS = ['one_off', 'every_n_days', 'weekly'] as const
const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'archived'] as const

/** The audience filter blob; every field optional, all ANDed by audience.ts. */
const audienceSchema = z
    .object({
        lastOrderOlderThanDays: z.number().int().positive().optional(),
        lastOrderWithinDays: z.number().int().positive().optional(),
        minOrderCount: z.number().int().nonnegative().optional(),
        minTotalSpent: z.number().nonnegative().optional(),
        channels: z.array(z.string()).optional(),
    })
    .strict()

const baseSchema = z.object({
    name: z.string().min(1, 'name is required'),
    message_template: z
        .string()
        .refine((v) => v.trim().length > 0, 'message_template cannot be blank')
        .describe('Body with {{firstName}}-style placeholders'),
    audience: audienceSchema.default({}),
    schedule_kind: z.enum(SCHEDULE_KINDS).default('one_off'),
    schedule_time: z.string().regex(TIME_24H, 'schedule_time must be "HH:MM"').default('10:00'),
    schedule_date: z.string().regex(ISO_DATE, 'schedule_date must be "YYYY-MM-DD"').optional(),
    schedule_interval_days: z.number().int().positive('schedule_interval_days must be > 0').optional(),
    schedule_weekdays: z
        .array(z.number().int().min(1).max(7))
        .default([])
        .describe('ISO weekdays, 1=Mon .. 7=Sun'),
    quiet_hours_start: z.string().regex(TIME_24H).default('21:00'),
    quiet_hours_end: z.string().regex(TIME_24H).default('08:00'),
    max_per_run: z.number().int().min(1).max(200).default(25),
    status: z.enum(CAMPAIGN_STATUSES).default('draft'),
})

/**
 * The full draft, with the cross-field rule the database enforces as
 * `sms_campaigns_schedule_fields_ck`.
 */
export const smsCampaignDraftSchema = baseSchema.superRefine((draft, ctx) => {
    if (draft.schedule_kind === 'one_off' && !draft.schedule_date) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schedule_date'],
            message: 'schedule_date is required for a one_off campaign, or it will never become due.',
        })
    }

    if (draft.schedule_kind === 'every_n_days' && draft.schedule_interval_days == null) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schedule_interval_days'],
            message: 'schedule_interval_days is required for an every_n_days campaign, or it will never become due.',
        })
    }

    if (draft.schedule_kind === 'weekly' && draft.schedule_weekdays.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schedule_weekdays'],
            message: 'schedule_weekdays must name at least one day for a weekly campaign, or it will never become due.',
        })
    }
})

export type SmsCampaignDraft = z.infer<typeof smsCampaignDraftSchema>

/** The `sms_campaigns` row an accepted draft becomes. */
export interface SmsCampaignRow {
    tenant_id: string
    name: string
    message_template: string
    audience: Record<string, unknown>
    schedule_kind: (typeof SCHEDULE_KINDS)[number]
    schedule_time: string
    schedule_date: string | null
    schedule_interval_days: number | null
    schedule_weekdays: number[]
    quiet_hours_start: string
    quiet_hours_end: string
    max_per_run: number
    status: (typeof CAMPAIGN_STATUSES)[number]
}

/**
 * Shape a validated draft into the row to insert. Field-by-field rather than a
 * spread, so a key the schema does not know about — a consent flag, say — can
 * never ride along into the write.
 */
export function campaignDraftToRow(tenantId: string, draft: SmsCampaignDraft): SmsCampaignRow {
    return {
        tenant_id: tenantId,
        name: draft.name.trim(),
        message_template: draft.message_template,
        audience: draft.audience,
        schedule_kind: draft.schedule_kind,
        schedule_time: draft.schedule_time,
        schedule_date: draft.schedule_date ?? null,
        schedule_interval_days: draft.schedule_interval_days ?? null,
        schedule_weekdays: draft.schedule_weekdays,
        quiet_hours_start: draft.quiet_hours_start,
        quiet_hours_end: draft.quiet_hours_end,
        max_per_run: draft.max_per_run,
        status: draft.status,
    }
}

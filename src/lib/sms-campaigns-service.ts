/**
 * SMS campaign writes and reads for the provisioning/MCP surface.
 *
 * Creating a campaign here schedules nothing by itself. Sending happens on the
 * merchant's Android handset, which polls for due campaigns and claims the run
 * before texting anyone (`webnegosyo-app/lib/sms/run-orchestrator.ts`). So a
 * campaign written by a tool call is inert until a signed-in device picks it up
 * — and a `draft` one never will, which is the safety property the draft
 * default exists to buy.
 *
 * Because that is invisible from the tool result, every create returns a
 * `notice` saying so. Without it an AI reports "campaign created" and the
 * merchant reasonably expects texts to go out.
 *
 * Validation and row shaping live in the pure `sms-campaign-draft.ts`, which is
 * also where the consent/opt-out exclusion is enforced.
 */

import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { smsCampaignDraftSchema, campaignDraftToRow } from '@/lib/sms-campaign-draft'

const CAMPAIGN_COLUMNS =
    'id, name, status, message_template, audience, schedule_kind, schedule_time, ' +
    'schedule_date, schedule_interval_days, schedule_weekdays, quiet_hours_start, ' +
    'quiet_hours_end, max_per_run, created_at'

const DRAFT_NOTICE =
    'Saved as a DRAFT: it will never become due and no one will be texted. A staff member must open the ' +
    'merchant Android app and activate it. Sending happens on that handset — this tool schedules nothing itself.'

const ACTIVE_NOTICE =
    'Saved as ACTIVE. It will send only when a signed-in merchant Android device is running and polls it as due ' +
    '(sending is done by the handset, not by this tool), and only to customers who gave SMS consent, outside quiet hours.'

/**
 * Create an SMS campaign for a tenant. Returns the inserted row plus a `notice`
 * describing what will and will not happen next.
 */
export async function createSmsCampaign(
    tenantId: string,
    input: unknown,
    ctx: ProvisioningCtx,
): Promise<Record<string, unknown>> {
    // Parse first: an unfireable schedule must be refused here, where the error
    // names the field, rather than as an opaque CHECK violation.
    const draft = smsCampaignDraftSchema.parse(input)
    const row = campaignDraftToRow(tenantId, draft)

    const { data, error } = await ctx.client
        .from('sms_campaigns')
        .insert(row as never)
        .select(CAMPAIGN_COLUMNS)
        .single()

    if (error) {
        throw new Error(`Could not create the SMS campaign: ${error.message}`)
    }

    return {
        ...(data as unknown as Record<string, unknown>),
        notice: row.status === 'active' ? ACTIVE_NOTICE : DRAFT_NOTICE,
    }
}

/**
 * List a tenant's SMS campaigns. A failed read THROWS rather than returning an
 * empty list: "no campaigns" would read as fact and invite the caller to create
 * a duplicate of one that already exists.
 */
export async function listSmsCampaignsForProvisioning(
    tenantId: string,
    ctx: ProvisioningCtx,
): Promise<Record<string, unknown>[]> {
    const { data, error } = await ctx.client
        .from('sms_campaigns')
        .select(CAMPAIGN_COLUMNS)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

    if (error) {
        throw new Error(`Could not read the tenant's SMS campaigns: ${error.message}`)
    }

    return (data ?? []) as unknown as Record<string, unknown>[]
}

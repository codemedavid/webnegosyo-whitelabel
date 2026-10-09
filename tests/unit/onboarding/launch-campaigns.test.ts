/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildLaunchCampaigns, draftLaunchCampaigns } from '@/lib/onboarding/launch-campaigns'
import { smsCampaignDraftSchema } from '@/lib/sms-campaign-draft'
import { validateCampaignDraft } from '../../../webnegosyo-app/lib/sms/campaign-form'
import { countSmsSegments, renderMessage } from '../../../webnegosyo-app/lib/sms/message-template'

const LONG_STORE = 'Kape at Tinapay ni Aling Rosa'

describe('buildLaunchCampaigns', () => {
  const drafts = buildLaunchCampaigns({ rewardLabel: 'Free Spanish Latte', threshold: 8 })

  it('drafts four ready-to-use texts, all saved as drafts that send nothing', () => {
    expect(drafts.map((draft) => draft.name)).toEqual([
      'Invite first-timers back',
      'Nudge slipping regulars',
      'Win back lapsed guests',
      'Weekend reminder',
    ])
    expect(drafts.every((draft) => draft.status === 'draft')).toBe(true)
  })

  it('uses repeating schedules only, so a draft is still valid on the day the owner turns it on', () => {
    expect(drafts.every((draft) => draft.schedule_kind !== 'one_off')).toBe(true)
  })

  it.each(buildLaunchCampaigns({ rewardLabel: 'Free Spanish Latte', threshold: 8 }))('"$name" passes the web schema and the app editor', (draft) => {
    expect(smsCampaignDraftSchema.safeParse(draft).success).toBe(true)
    const appDraft = {
      name: draft.name,
      messageTemplate: draft.message_template,
      audience: draft.audience,
      scheduleKind: draft.schedule_kind,
      scheduleTime: draft.schedule_time,
      scheduleDate: null,
      scheduleIntervalDays: draft.schedule_interval_days ?? null,
      scheduleWeekdays: draft.schedule_weekdays,
      quietHoursStart: draft.quiet_hours_start,
      quietHoursEnd: draft.quiet_hours_end,
      maxPerRun: draft.max_per_run,
    }
    expect(validateCampaignDraft(appDraft, '2030-01-01')).toEqual({ isValid: true, errors: {} })
  })

  it.each(buildLaunchCampaigns({ rewardLabel: 'Free Spanish Latte', threshold: 8 }))('"$name" stays one plain-letter text for a long store name', (draft) => {
    const text = renderMessage(draft.message_template, {
      id: 'c', name: 'Maria Clara', phone_e164: null, order_count: 12, total_spent: 0,
      last_order_at: null, channels_used: [], sms_consent: true, sms_opt_out: false,
    }, { storeName: LONG_STORE })
    expect(countSmsSegments(text)).toMatchObject({ encoding: 'GSM7', segments: 1 })
  })

  it('names the reward in the first-timer text, and drops it when the name would not text cleanly', () => {
    expect(drafts[0].message_template).toContain('8 orders = Free Spanish Latte')
    const odd = buildLaunchCampaigns({ rewardLabel: 'Free 🍵 Matcha “Special”', threshold: 8 })
    expect(odd[0].message_template).not.toMatch(/Matcha/)
    expect(countSmsSegments(odd[0].message_template).encoding).toBe('GSM7')
    expect(buildLaunchCampaigns({ rewardLabel: null, threshold: null })[0].message_template).not.toMatch(/orders =/)
  })
})

function fakeAdmin(existingNames: string[], insertError: { message: string } | null = null) {
  const inserted: unknown[] = []
  const client = {
    from() {
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      Object.assign(builder, {
        select: chain, eq: chain, limit: chain,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: existingNames.map((name) => ({ name })), error: null }).then(resolve),
        insert: async (rows: unknown[]) => {
          inserted.push(...rows)
          return { error: insertError }
        },
      })
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, inserted }
}

describe('draftLaunchCampaigns', () => {
  it('saves every draft for the store', async () => {
    const { client, inserted } = fakeAdmin([])

    const result = await draftLaunchCampaigns(client, 'tenant-1', { rewardLabel: 'Free Latte', threshold: 8 })

    expect(result).toEqual({ drafted: 4 })
    expect(inserted).toHaveLength(4)
    expect(inserted.every((row) => (row as { tenant_id: string; status: string }).tenant_id === 'tenant-1' && (row as { status: string }).status === 'draft')).toBe(true)
  })

  it('never saves the same campaign twice on a retried build', async () => {
    const { client, inserted } = fakeAdmin(['Invite first-timers back', 'Weekend reminder'])

    const result = await draftLaunchCampaigns(client, 'tenant-1', { rewardLabel: 'Free Latte', threshold: 8 })

    expect(result).toEqual({ drafted: 4 })
    expect((inserted as Array<{ name: string }>).map((row) => row.name)).toEqual(['Nudge slipping regulars', 'Win back lapsed guests'])
  })

  it('throws when the drafts cannot be saved', async () => {
    const { client } = fakeAdmin([], { message: 'denied' })

    await expect(draftLaunchCampaigns(client, 'tenant-1', { rewardLabel: null, threshold: null })).rejects.toThrow(/denied/)
  })
})

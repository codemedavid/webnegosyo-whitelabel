/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import { LAUNCH_CAMPAIGNS, buildLaunchCampaigns, draftLaunchCampaigns } from '@/lib/onboarding/launch-campaigns'
import { buildLaunchAutomations, draftLaunchAutomations } from '@/lib/onboarding/launch-automations'
import { renderAutomationText, countSmsSegments as countAutomationSegments } from '@/lib/sms-automations/template'
import { smsCampaignDraftSchema } from '@/lib/sms-campaign-draft'
import { validateCampaignDraft } from '../../../webnegosyo-app/lib/sms/campaign-form'
import { countSmsSegments, renderMessage } from '../../../webnegosyo-app/lib/sms/message-template'

const LONG_STORE = 'Kape at Tinapay ni Aling Rosa'

describe('the ready-made texts the reveal lists', () => {
  it('lists the three automations, then the weekend campaign', () => {
    expect(LAUNCH_CAMPAIGNS.map((text) => text.name)).toEqual([
      'Invite first-timers back',
      'Nudge slipping regulars',
      'Win back lapsed guests',
      'Weekend reminder',
    ])
  })
})

describe('buildLaunchCampaigns', () => {
  const drafts = buildLaunchCampaigns()

  it('drafts only the weekend reminder, saved as a draft that sends nothing, on a repeating schedule', () => {
    expect(drafts.map((draft) => draft.name)).toEqual(['Weekend reminder'])
    expect(drafts.every((draft) => draft.status === 'draft' && draft.schedule_kind !== 'one_off')).toBe(true)
  })

  it.each(buildLaunchCampaigns())('"$name" passes the web schema and the app editor', (draft) => {
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

  it.each(buildLaunchCampaigns())('"$name" stays one plain-letter text for a long store name', (draft) => {
    const text = renderMessage(draft.message_template, {
      id: 'c', name: 'Maria Clara', phone_e164: null, order_count: 12, total_spent: 0,
      last_order_at: null, channels_used: [], sms_consent: true, sms_opt_out: false,
    }, { storeName: LONG_STORE })
    expect(countSmsSegments(text)).toMatchObject({ encoding: 'GSM7', segments: 1 })
  })
})

describe('buildLaunchAutomations', () => {
  const guest = {
    id: 'c', name: 'Maria Clara', phone: '+639170000000', smsConsent: true, smsOptOut: false, orderCount: 1,
    totalSpent: 300, firstOrderAt: '2026-10-01T00:00:00Z', lastOrderAt: '2026-10-01T00:00:00Z', favoriteItem: null,
  }
  const store = { tenantId: 't', storeName: LONG_STORE, baseUrl: 'https://kape-at-tinapay.webnegosyo.com' }

  it('drafts the three follow-ups as automations', () => {
    expect(buildLaunchAutomations({ rewardLabel: null, threshold: null }).map((d) => d.recipe))
      .toEqual(['first_visit_followup', 'regulars_gone_quiet', 'win_back'])
  })

  it.each(buildLaunchAutomations({ rewardLabel: 'Free Spanish Latte', threshold: 8 }))('"$name" renders as plain letters, at most two texts', (draft) => {
    const text = renderAutomationText(draft.messageTemplate, { guest, occurrenceKey: 'k', dueAt: '', expiresAt: '' }, store, { reviewUrl: null, optOutLine: null }, new Date('2026-11-01T00:00:00Z'))
    expect(countAutomationSegments(text).encoding).toBe('GSM7')
    expect(countAutomationSegments(text).segments).toBeLessThanOrEqual(2)
  })

  it('names the reward in the first-timer text, and drops it when the name would not text cleanly', () => {
    expect(buildLaunchAutomations({ rewardLabel: 'Free Spanish Latte', threshold: 8 })[0].messageTemplate).toContain('8 orders = Free Spanish Latte')
    const odd = buildLaunchAutomations({ rewardLabel: 'Free 🍵 Matcha “Special”', threshold: 8 })
    expect(odd[0].messageTemplate).not.toMatch(/Matcha/)
    expect(buildLaunchAutomations({ rewardLabel: null, threshold: null })[0].messageTemplate).not.toMatch(/orders =/)
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
  it('saves the weekend draft for the store, once', async () => {
    const fresh = fakeAdmin([])
    expect(await draftLaunchCampaigns(fresh.client, 'tenant-1')).toEqual({ drafted: 1 })
    expect(fresh.inserted).toHaveLength(1)
    expect((fresh.inserted[0] as { tenant_id: string; status: string })).toMatchObject({ tenant_id: 'tenant-1', status: 'draft' })

    const retried = fakeAdmin(['Weekend reminder'])
    expect(await draftLaunchCampaigns(retried.client, 'tenant-1')).toEqual({ drafted: 1 })
    expect(retried.inserted).toEqual([])
  })

  it('throws when the draft cannot be saved', async () => {
    const { client } = fakeAdmin([], { message: 'denied' })
    await expect(draftLaunchCampaigns(client, 'tenant-1')).rejects.toThrow(/denied/)
  })
})

function fakeAutomationsAdmin(existingRecipes: string[]) {
  const upserted: unknown[] = []
  const client = {
    from() {
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      Object.assign(builder, {
        select: chain, eq: chain,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: existingRecipes.map((recipe) => ({ recipe })), error: null }).then(resolve),
        upsert: async (rows: unknown[], options: unknown) => {
          upserted.push(...rows)
          expect(options).toEqual({ onConflict: 'tenant_id,recipe', ignoreDuplicates: true })
          return { error: null }
        },
      })
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, upserted }
}

describe('draftLaunchAutomations', () => {
  it('saves the missing follow-ups Off, marked as onboarding', async () => {
    const { client, upserted } = fakeAutomationsAdmin(['win_back'])
    expect(await draftLaunchAutomations(client, 'tenant-1', { rewardLabel: null, threshold: null })).toEqual({ drafted: 3 })
    expect((upserted as Array<{ recipe: string; status: string; source: string }>).map((row) => [row.recipe, row.status, row.source]))
      .toEqual([['first_visit_followup', 'off', 'onboarding'], ['regulars_gone_quiet', 'off', 'onboarding']])
  })
})

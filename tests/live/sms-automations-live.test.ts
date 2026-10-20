/** @jest-environment node */
/**
 * LIVE DRY RUN of the automation planner against real stores: reads the
 * platform database, plans every recipe with its default message, and prints
 * what WOULD be queued. Writes nothing.
 *
 * Opt-in:
 *   SMS_AUTOMATIONS_LIVE=1 npx jest tests/live/sms-automations-live.test.ts
 *   SMS_AUTOMATIONS_LIVE_TENANTS=<id,id> to pick stores (default: the 5 with the most consenting guests).
 */
import fs from 'fs'
import path from 'path'
import type { AutomationRow } from '@/lib/sms-automations/types'

const isLive = process.env.SMS_AUTOMATIONS_LIVE === '1'

if (isLive) {
  // The test environment loads .env.test (fake hosts); a live run must use the real ones.
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const liveDescribe = isLive ? describe : describe.skip

liveDescribe('SMS automations dry run (live platform DB, read-only)', () => {
  jest.setTimeout(120_000)

  it('plans every recipe for real stores without queueing anything', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { loadStoreSnapshot } = await import('@/lib/sms-automations/server/snapshot')
    const { planTexts } = await import('@/lib/sms-automations/planner')
    const { candidatesFor } = await import('@/lib/sms-automations/work')
    const { RECIPES } = await import('@/lib/sms-automations/recipes')
    const { countSmsSegments } = await import('@/lib/sms-automations/template')
    const admin = createAdminClient()

    let tenants = (process.env.SMS_AUTOMATIONS_LIVE_TENANTS ?? '').split(',').filter(Boolean)
    if (tenants.length === 0) {
      const { data, error } = await admin.from('customers').select('tenant_id')
        .eq('sms_consent', true).eq('sms_opt_out', false).not('phone_e164', 'is', null).limit(5000)
      if (error) throw error
      const counts = new Map<string, number>()
      for (const row of data ?? []) counts.set(row.tenant_id, (counts.get(row.tenant_id) ?? 0) + 1)
      tenants = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id)
    }

    const now = new Date()
    for (const tenantId of tenants) {
      const automations: AutomationRow[] = RECIPES.map((recipe) => ({
        id: `dry-${recipe.id}`, tenant_id: tenantId, recipe: recipe.id, name: recipe.title, params: {},
        message_template: recipe.defaultMessage, run_mode: 'auto', reentry_days: null, status: 'on', source: 'owner',
        created_at: now.toISOString(), updated_at: now.toISOString(),
      }))
      const started = Date.now()
      const snapshot = await loadStoreSnapshot(admin, tenantId, automations, now)
      const loadMs = Date.now() - started
      const work = automations.map((automation) => ({ automation, candidates: candidatesFor(automation, snapshot.data, now) }))
      const base = {
        now, store: snapshot.store,
        settings: { ...snapshot.settings, reviewUrl: snapshot.settings.reviewUrl ?? 'https://g.page/r/example' },
        suppressedPhones: snapshot.suppressedPhones, history: snapshot.history, work,
      }
      const fresh = planTexts({ ...base, mode: 'fresh' })
      const all = planTexts({ ...base, mode: 'all' })

      const lines = automations.map((a) => {
        const f = fresh.reports.get(a.id)
        const b = all.reports.get(a.id)
        return `  ${a.recipe.padEnd(24)} fresh ${String(f?.queued ?? 0).padStart(3)}/${String(f?.qualifying ?? 0).padEnd(4)} run-now ${String(b?.queued ?? 0).padStart(3)}/${String(b?.qualifying ?? 0).padEnd(4)} skipped ${JSON.stringify(b?.skipped ?? {})}`
      })
      const sample = all.drafts[0]
      process.stdout.write([
        `\n${snapshot.store.storeName} (${tenantId}) — ${snapshot.data.guests.length} guests with a phone, orders ${snapshot.data.orders ? snapshot.data.orders.length : 'off-platform'}, stamp cards ${snapshot.data.balances.length}, rewards ${snapshot.data.entitlements.length}, loyalty ${snapshot.data.loyaltyOn ? 'on' : 'off'}, loaded in ${loadMs}ms`,
        ...lines,
        sample ? `  sample (${sample.recipe}, ${countSmsSegments(sample.body).segments} part, ${countSmsSegments(sample.body).encoding}): ${sample.body}` : '  (nothing to send)',
        '',
      ].join('\n'))

      for (const draft of all.drafts) {
        const guest = snapshot.data.guests.find((g) => g.id === draft.customer_id)
        expect(guest?.smsConsent).toBe(true)
        expect(guest?.smsOptOut).toBe(false)
        expect(snapshot.suppressedPhones.has(draft.phone_e164)).toBe(false)
        expect(draft.body.length).toBeLessThanOrEqual(1000)
      }
      // One text per guest per plan, whatever the number of automations.
      expect(new Set(all.drafts.map((d) => d.phone_e164)).size).toBe(all.drafts.length)
    }
  })
})

/**
 * LIVE round trip of the API handlers on a demo store (default: Sample Demo).
 * Writes automations/settings and deletes everything it created afterwards.
 *   SMS_AUTOMATIONS_LIVE=1 SMS_AUTOMATIONS_LIVE_DEMO=<tenant id> npx jest tests/live/sms-automations-live.test.ts
 */
jest.mock('server-only', () => ({}))

liveDescribe('SMS automations API handlers (live platform DB, demo store)', () => {
  jest.setTimeout(120_000)
  const tenantId = process.env.SMS_AUTOMATIONS_LIVE_DEMO ?? '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'

  it('saves, previews, refuses what cannot run, and cleans up', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const reads = await import('@/lib/sms-automations/api/reads')
    const writes = await import('@/lib/sms-automations/api/writes')
    const { normalizeDraft } = await import('@/lib/sms-automations/api/schema')
    const { getRecipe } = await import('@/lib/sms-automations/recipes')
    const db = createAdminClient()

    const { data: owner } = await db.from('app_users').select('user_id').eq('tenant_id', tenantId).eq('is_owner', true).limit(1).single()
    const { data: before } = await db.from('sms_automations').select('id').eq('tenant_id', tenantId)
    const { data: settingsBefore } = await db.from('sms_settings').select('tenant_id').eq('tenant_id', tenantId).maybeSingle()
    expect(before ?? []).toEqual([]) // a clean demo store; never run this against a store that uses automations
    const draftOf = (recipe: 'win_back' | 'review_request' | 'loyalty_reward_waiting') => {
      const result = normalizeDraft({ recipe, messageTemplate: getRecipe(recipe).defaultMessage })
      if (!result.ok) throw new Error(result.error)
      return result.draft
    }

    try {
      const saved = await writes.saveAutomation(db, tenantId, owner!.user_id, draftOf('win_back'))
      expect(saved).toMatchObject({ ok: true, value: { created: true } })
      const again = await writes.saveAutomation(db, tenantId, owner!.user_id, { ...draftOf('win_back'), params: { inactiveDays: 45 } })
      expect(again).toMatchObject({ ok: true, value: { created: false } })
      const id = saved.ok ? saved.value.id : ''

      const view = await reads.listAutomationsView(db, tenantId)
      expect(view.automations).toHaveLength(1)
      expect(view.automations[0]).toMatchObject({ status: 'off', params: { inactiveDays: 45 }, description: 'Text guests who haven’t ordered in 45 days' })
      expect(view.recipes).toHaveLength(7)
      expect(view.sender.enrolled).toBe(0)

      const preview = await writes.previewAutomation(db, tenantId, draftOf('win_back'))
      expect(preview.audience.withPhone).toBeGreaterThanOrEqual(preview.audience.textable)

      expect(await writes.setAutomationStatus(db, tenantId, id, 'on', true)).toMatchObject({ ok: false, code: 'no_sender' })
      expect(await writes.runAutomationNow(db, tenantId, id)).toMatchObject({ ok: false, code: 'no_sender' })
      expect(await writes.setAutomationStatus(db, tenantId, id, 'on', false)).toMatchObject({ ok: true, value: { status: 'on', backlog: null } })
      expect(await writes.setAutomationStatus(db, tenantId, id, 'off', false)).toMatchObject({ ok: true })

      const review = await writes.saveAutomation(db, tenantId, owner!.user_id, draftOf('review_request'))
      const reviewId = review.ok ? review.value.id : ''
      expect(await writes.setAutomationStatus(db, tenantId, reviewId, 'on', false)).toMatchObject({ ok: false, code: 'missing_review_link' })
      const reward = await writes.saveAutomation(db, tenantId, owner!.user_id, draftOf('loyalty_reward_waiting'))
      expect(await writes.setAutomationStatus(db, tenantId, reward.ok ? reward.value.id : '', 'on', false)).toMatchObject({ ok: false, code: 'loyalty_off' })

      await writes.saveSettings(db, tenantId, {
        quietHoursStart: '21:00', quietHoursEnd: '07:00', guestCapDays: 4, dailyLimit: 50, optOutLine: null, reviewUrl: 'https://g.page/r/demo',
      })
      expect(await reads.readSettings(db, tenantId)).toMatchObject({ quietHoursStart: '21:00', reviewUrl: 'https://g.page/r/demo' })
      expect(await writes.setAutomationStatus(db, tenantId, reviewId, 'on', false)).toMatchObject({ ok: true })

      expect((await reads.listActivity(db, tenantId, {})).items).toEqual([])
      expect(await writes.cancelWaiting(db, tenantId)).toBe(0)
    } finally {
      await db.from('sms_automations').delete().eq('tenant_id', tenantId)
      if (!settingsBefore) await db.from('sms_settings').delete().eq('tenant_id', tenantId)
    }
  })
})

liveDescribe('SMS automations "Write it for me" (live OpenRouter)', () => {
  jest.setTimeout(60_000)
  it('returns messages that passed the gate', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { writeMessages } = await import('@/lib/sms-automations/api/writes')
    const tenantId = process.env.SMS_AUTOMATIONS_LIVE_DEMO ?? '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'
    for (const [recipe, language] of [['win_back', 'tl'], ['review_request', 'en']] as const) {
      const result = await writeMessages(createAdminClient(), tenantId, recipe, language)
      process.stdout.write(`\n${recipe}/${language}: ${JSON.stringify(result)}\n`)
      expect(result.ok).toBe(true)
    }
  })
})

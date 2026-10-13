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

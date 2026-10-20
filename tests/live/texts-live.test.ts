/** @jest-environment node */
/**
 * LIVE read-only check of the web Texts page's server reads against the real
 * platform database: the phone list, the live poll, the campaign list, the
 * audience preview and the 30-day line. Nothing is written.
 *
 * Opt-in:
 *   TEXTS_LIVE=1 TEXTS_LIVE_TENANT=<uuid> npx jest tests/live/texts-live.test.ts
 */
import fs from 'fs'
import path from 'path'

const isLive = process.env.TEXTS_LIVE === '1'
const TENANT = process.env.TEXTS_LIVE_TENANT ?? ''

if (isLive) {
  // The test environment loads .env.test (fake hosts); a live run must use the real ones.
  const file = path.join(process.cwd(), '.env.local')
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

jest.mock('server-only', () => ({}))

const describeLive = isLive && TENANT ? describe : describe.skip

describeLive('web Texts reads (live, read-only)', () => {
  const now = new Date()

  async function db() {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    return createAdminClient()
  }

  it('lists the sending phones with a state for each', async () => {
    const { listSendingPhones } = await import('@/lib/texts/server/phones')
    const phones = await listSendingPhones(await db(), TENANT, now)
    for (const phone of phones) {
      expect(['never', 'ready', 'resting', 'late', 'offline']).toContain(phone.state)
      expect(phone.name.length).toBeGreaterThan(0)
    }
  })

  it('answers the live poll quickly', async () => {
    const { readTextsLive } = await import('@/lib/texts/server/live')
    const started = Date.now()
    const live = await readTextsLive(await db(), TENANT, now)
    expect(Date.now() - started).toBeLessThan(5000)
    expect(live.sender.now).toBeTruthy()
    expect(Array.isArray(live.attention)).toBe(true)
  })

  it('lists campaigns, previews an audience and reads the 30-day line', async () => {
    const reads = await import('@/lib/texts/server/campaign-reads')
    const client = await db()
    const campaigns = await reads.listCampaignsView(client, TENANT, now)
    expect(Array.isArray(campaigns)).toBe(true)
    const preview = await reads.previewCampaignAudience(client, TENANT, {
      audience: { minOrderCount: 2 },
      messageTemplate: 'Hi {{firstName}}, see you this weekend at {{storeName}}!',
    }, now)
    expect(preview.reach).toBeGreaterThanOrEqual(0)
    expect(preview.segmentsPerGuest).toBeGreaterThanOrEqual(1)
    const line = await reads.readThirtyDayLine(client, TENANT, now)
    expect(line.sent).toBeGreaterThanOrEqual(0)
  })
})

/**
 * LIVE write check on a store WITH NO SENDING PHONE (so nothing can ever be
 * claimed or sent): save → send now → one campaign row per consenting guest
 * lands in sms_outbox with the campaign shape → pause withdraws it → cleanup.
 *
 *   TEXTS_LIVE_WRITE=1 TEXTS_LIVE_WRITE_TENANT=<uuid with 0 phones> TEXTS_LIVE_USER=<staff auth uuid> npx jest tests/live/texts-live.test.ts
 */
const WRITE_TENANT = process.env.TEXTS_LIVE_WRITE_TENANT ?? ''
const WRITE_USER = process.env.TEXTS_LIVE_USER ?? ''
const describeWrite = isLive && process.env.TEXTS_LIVE_WRITE === '1' && WRITE_TENANT && WRITE_USER ? describe : describe.skip

describeWrite('web Texts campaign writes (live, phone-less store)', () => {
  let campaignId = ''

  async function db() {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    return createAdminClient()
  }

  afterAll(async () => {
    if (!campaignId) return
    const client = await db()
    await client.from('sms_outbox').delete().eq('tenant_id', WRITE_TENANT).eq('source', 'campaign')
    await client.from('sms_campaign_runs').delete().eq('campaign_id', campaignId)
    await client.from('sms_campaigns').delete().eq('id', campaignId)
  })

  it('queues campaign texts through the outbox and withdraws them on pause', async () => {
    const client = await db()
    const { count: phones } = await client.from('loyalty_sms_devices')
      .select('device_id', { count: 'exact', head: true }).eq('tenant_id', WRITE_TENANT).eq('enabled', true)
    expect(phones).toBe(0) // safety: this test must never run where a phone could send

    const writes = await import('@/lib/texts/server/campaign-writes')
    const now = new Date()
    const manila = new Date(now.getTime() + 8 * 3600_000).toISOString()
    const saved = await writes.saveCampaignDraft(client, WRITE_TENANT, WRITE_USER, {
      name: 'Live check (delete me)',
      messageTemplate: 'Hi {{firstName}}, this is a test from {{storeName}}.',
      audience: {},
      schedule: { kind: 'one_off', time: manila.slice(11, 16), date: manila.slice(0, 10), intervalDays: null, weekdays: [], endsOn: null },
    })
    if (!saved.ok) throw new Error(saved.error)
    campaignId = saved.value.id

    // No phone: Send now makes it live and waits (the tick starts the run once a phone checks in).
    const sent = await writes.sendCampaignNow(client, WRITE_TENANT, campaignId, now)
    if (!sent.ok) throw new Error(`${sent.code}: ${sent.error}`)
    expect(sent.value.queued).toBe(0)

    // What the tick does when a phone appears: start the run → rows in the outbox.
    const { startCampaignRun } = await import('@/lib/texts/server/campaign-run')
    const started = await startCampaignRun(client, WRITE_TENANT, campaignId, { trigger: 'send_now', dueAt: now, now })
    if (!started.ok) throw new Error(`${started.code}: ${started.error}`)
    expect(started.value.queued).toBeGreaterThan(0) // the store needs one consenting guest with a phone

    const { data: rows } = await client.from('sms_outbox')
      .select('family, recipe, source, status, priority, campaign_run_id, occurrence_key, automation_id')
      .eq('tenant_id', WRITE_TENANT).eq('source', 'campaign')
    expect((rows ?? []).length).toBe(started.value.queued)
    for (const row of rows ?? []) {
      expect(row).toMatchObject({ family: 'campaign', recipe: 'campaign', status: 'queued', automation_id: null })
      expect(row.occurrence_key).toBe(`run:${row.campaign_run_id}`)
    }

    // A second start for the same occurrence never queues a second copy.
    const twice = await startCampaignRun(client, WRITE_TENANT, campaignId, { trigger: 'send_now', dueAt: now, now })
    const { count: total } = await client.from('sms_outbox')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', WRITE_TENANT).eq('source', 'campaign')
    expect(total).toBe(started.value.queued)
    expect(twice.ok ? twice.value.queued : 0).toBe(0)

    const paused = await writes.pauseCampaign(client, WRITE_TENANT, campaignId, new Date())
    if (!paused.ok) throw new Error(paused.error)
    const { data: after } = await client.from('sms_outbox').select('status')
      .eq('tenant_id', WRITE_TENANT).eq('source', 'campaign')
    expect((after ?? []).every((row) => row.status !== 'queued')).toBe(true)
  }, 60_000)
})

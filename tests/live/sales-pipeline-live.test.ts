/** @jest-environment node */
/**
 * LIVE read of the superadmin sales pipeline against the real platform
 * database: the real loader, the real engine. Read-only.
 *
 * Opt-in:
 *   PIPELINE_LIVE=1 npx jest --config jest.config.cjs tests/live/sales-pipeline-live.test.ts
 * (reads `.env.local`, or the file named by LIVE_ENV_FILE)
 */
import fs from 'fs'
import path from 'path'

const isLive = process.env.PIPELINE_LIVE === '1'

if (isLive) {
  // The test environment loads .env.test (fake hosts); a live run must use the real ones.
  const file = process.env.LIVE_ENV_FILE ?? path.join(process.cwd(), '.env.local')
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

jest.mock('server-only', () => ({}))

const describeLive = isLive ? describe : describe.skip

describeLive('sales pipeline (live platform DB)', () => {
  it('loads every lead and summarizes each offer with monotonic stage counts', async () => {
    const { loadPipelineData } = await import('@/lib/sales-pipeline/pipeline-server')
    const { filterPipelineLeads } = await import('@/lib/sales-pipeline/filters')
    const { summarizePipeline } = await import('@/lib/sales-pipeline/stages')
    const { findNeedsAttention } = await import('@/lib/sales-pipeline/needs-attention')

    const all = await loadPipelineData({ range: 'all', offer: 'all' })
    const nowMs = Date.parse(all.generatedAt)
    expect(all.leads.length).toBeGreaterThan(0)

    for (const offer of ['monthly', 'one_time', 'all'] as const) {
      const data = await loadPipelineData({ range: 'all', offer }, nowMs)
      // The loader's own filtering agrees with the pure filter.
      expect(data.leads.map((lead) => lead.id)).toEqual(
        filterPipelineLeads(all.leads, { range: 'all', offer }, nowMs).map((lead) => lead.id),
      )
      const leads = data.leads
      const summary = summarizePipeline(leads)
      const counts = summary.stages.map((stage) => stage.count)
      counts.slice(1).forEach((count, index) => expect(count).toBeLessThanOrEqual(counts[index]))

      const attention = findNeedsAttention(leads, nowMs).map((group) => `${group.kind}=${group.items.length}`)
      process.stdout.write(
        `[pipeline:${offer}] ${summary.stages.map((stage) => `${stage.key}=${stage.count}`).join(' ')}` +
          ` | order→live=${summary.orderToLiveMedianMs} | attention: ${attention.join(' ') || 'none'}` +
          ` | unreadStores=${data.storesWithUnreadOrders}\n`,
      )
    }
  }, 60_000)
})

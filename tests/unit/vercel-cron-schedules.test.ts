import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The scheduled jobs are the only thing that runs them.
 *
 * `/api/loyalty/maintenance` releases expired loyalty holds, projects paid
 * receipts and reconciles refunds. It was scheduled every minute, which held an
 * isolate open against a stalled database — so the handler gained an 8s query
 * budget and a `maxDuration` cap. The schedule itself was removed in the same
 * change and nothing replaced it: no workflow, no `pg_cron`, no other entry.
 * The job silently stopped running altogether, so holds would never release.
 *
 * A cron is invisible when it is missing — nothing fails, the work just never
 * happens — so it is pinned here.
 */
describe('vercel.json cron schedules', () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
  ) as { crons?: { path: string; schedule: string }[] }

  const crons = config.crons ?? []
  const pathOf = (path: string) => crons.find((cron) => cron.path === path)

  it('schedules loyalty maintenance', () => {
    expect(pathOf('/api/loyalty/maintenance')).toBeDefined()
  })

  it('does not run loyalty maintenance every minute', () => {
    // The every-minute tick is what saturated the database.
    expect(pathOf('/api/loyalty/maintenance')?.schedule).not.toBe('* * * * *')
  })

  it('still schedules the Loyverse reconcile', () => {
    expect(pathOf('/api/loyverse/reconcile')).toBeDefined()
  })
})

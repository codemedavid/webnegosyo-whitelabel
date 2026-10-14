/**
 * The send-time guarantees of the SMS outbox, asserted against the migration
 * corpus (the LATEST definition of each function wins, as in the database).
 * The fake DB used elsewhere cannot run PL/pgSQL, so these pin the rules that
 * only the SQL enforces:
 *   - a campaign text is released only while its campaign is still live and
 *     its run still open (a pause between the status flip and the withdraw,
 *     or one written by staff through PostgREST, must not let texts out);
 *   - a text the phone may have sent before a crash counts toward the
 *     per-guest cap, like one the sweep marked `unconfirmed`;
 *   - a server campaign never goes live from outside the web: only a live
 *     campaign may be paused there, so draft -> paused -> resumed cannot
 *     bypass the web's checks.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')

function latestBody(functionName: string): string {
  const definition = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)([\\s\\S]*?)\\1`,
    'gi',
  )
  let latest: string | null = null
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    for (const match of sql.matchAll(definition)) latest = match[2]
  }
  if (latest === null) throw new Error(`${functionName} is not defined in any migration`)
  return latest.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ')
}

describe('claim_sms_outbox_message (latest migration)', () => {
  const body = latestBody('claim_sms_outbox_message')

  it('cancels a campaign text whose campaign is no longer live or whose run closed', () => {
    expect(body).toMatch(/msg\.source\s*=\s*'campaign'/)
    expect(body).toMatch(/public\.sms_campaign_runs/)
    expect(body).toMatch(/r\.status\s+in\s*\(\s*'pending'\s*,\s*'running'\s*\)/)
    expect(body).toMatch(/c\.status\s*=\s*'scheduled'/)
  })

  it('withdraws a paused campaign\'s text as "paused" so a resume puts it back', () => {
    expect(body).toMatch(/reason\s*:=\s*case[^;]*'paused'[^;]*'archived'/)
  })

  it('counts a text lost to a phone restart toward the per-guest cap', () => {
    expect(body).toMatch(/o\.error\s+in\s*\(\s*'unconfirmed'\s*,\s*'device_restarted'\s*\)/)
  })

  it('still cancels automatic texts of an automation switched off', () => {
    expect(body).toMatch(/reason\s*:=\s*'automation_off'/)
  })
})

describe('sms_campaigns_guard (latest migration)', () => {
  const body = latestBody('sms_campaigns_guard')

  it('lets an untrusted writer pause only a live campaign', () => {
    expect(body).toMatch(/new\.status\s*=\s*'paused'\s+and\s+old\.status\s+in\s*\(\s*'scheduled'\s*,\s*'active'\s*\)/)
  })

  it('still lets an untrusted writer archive, resume a paused one, or rename', () => {
    expect(body).toMatch(/new\.status\s*=\s*'archived'/)
    expect(body).toMatch(/old\.status\s*=\s*'paused'\s+and\s+new\.status\s+in\s*\(\s*'active'\s*,\s*'scheduled'\s*\)/)
    expect(body).toMatch(/free_columns\s+constant\s+text\[\]\s*:=\s*array\['status',\s*'name',\s*'updated_at'\]/)
  })
})

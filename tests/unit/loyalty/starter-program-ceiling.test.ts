/** @jest-environment node */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

describe('starter reward ceiling', () => {
  it('skips the card when the only items are far above a typical order', async () => {
    const { buildStarterLoyaltyProgram } = await import('@/lib/loyalty/starter-program')
    const result = buildStarterLoyaltyProgram({
      storeName: 'Steak Co',
      items: [{ id: 'steak', name: 'Steak', price: 450, isAvailable: true }],
      bestSellerIds: ['steak'],
      typicalOrder: 50,
    })
    expect(result).toBeNull()
  })
})

describe('migration versions', () => {
  it('has no new duplicate versions for the wallet rate-limit migration', () => {
    const dir = join(process.cwd(), 'supabase/migrations')
    const files = readdirSync(dir).filter((f) => f.startsWith('20261004'))
    const versions = files.map((f) => f.split('_')[0])
    expect(versions.filter((v) => v === '20261004180000')).toHaveLength(1)
    const sql = readFileSync(join(dir, '20261004185000_loyalty_wallet_rate_limit_reason.sql'), 'utf8')
    expect(sql).toMatch(/create or replace function public\.loyalty_wallet_issuance_retry_at/)
  })

  it('closes the anon insert path on checkout_leads', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261010010000_checkout_leads_close_anon_insert.sql'), 'utf8')
    expect(sql).toMatch(/drop policy if exists checkout_leads_public_insert/)
    expect(sql).toMatch(/revoke insert.*from anon/)
  })
})

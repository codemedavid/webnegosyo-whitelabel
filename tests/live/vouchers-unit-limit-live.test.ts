/** @jest-environment node */
/**
 * LIVE check of "only discount N items" vouchers against the real platform
 * database, on the demo store (Webnegosyo Coffee): a temporary voucher is
 * created, read back through the real repository + mapper, priced through the
 * server's own `priceOrderWithVouchers`, withheld from an old register, and
 * deleted again. Touches no other store.
 *
 *   VOUCHERS_UNITS_LIVE=1 npx jest tests/live/vouchers-unit-limit-live.test.ts
 */
import fs from 'fs'
import path from 'path'

const isLive = process.env.VOUCHERS_UNITS_LIVE === '1'
const DEMO_SLUG = 'webnegosyo-coffee'

function loadEnv(): void {
  // A worktree has no .env.local of its own; fall back to the main checkout's.
  const candidates = [path.join(process.cwd(), '.env.local'), path.join(process.cwd(), '../../../.env.local')]
  const file = candidates.find((candidate) => fs.existsSync(candidate))
  if (!file) throw new Error('No .env.local found for the live run')
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

if (isLive) loadEnv()

const liveDescribe = isLive ? describe : describe.skip

liveDescribe('unit-limited vouchers (live platform DB, demo store)', () => {
  const voucherIds: string[] = []

  async function load() {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: tenant } = await admin.from('tenants').select('id').eq('slug', DEMO_SLUG).single()
    const tenantId = (tenant as { id: string }).id
    const { data: menu } = await admin
      .from('menu_items')
      .select('id, price')
      .eq('tenant_id', tenantId)
      .gt('price', 0)
      .order('price', { ascending: true })
      .limit(2)
    const items = (menu ?? []) as Array<{ id: string; price: number }>
    if (items.length < 2) throw new Error('The demo store needs two priced dishes')
    return { admin, tenantId, items }
  }

  afterAll(async () => {
    if (voucherIds.length === 0) return
    const { createAdminClient } = await import('@/lib/supabase/admin')
    await createAdminClient().from('vouchers').delete().in('id', voucherIds)
  })

  test('discounts one unit, honours the chosen item, and hides from old registers', async () => {
    const { admin, tenantId, items } = await load()
    const code = `LIVEUNIT${Date.now().toString(36).toUpperCase()}`
    const { data: inserted, error } = await admin
      .from('vouchers')
      .insert({
        tenant_id: tenantId,
        code,
        name: 'LIVE TEST — delete me',
        discount_type: 'percent',
        discount_value: 50,
        max_discounted_units: 1,
        scope: 'universal',
        is_stackable: true,
        is_active: false,
        channels: ['checkout', 'pos'],
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    voucherIds.push((inserted as { id: string }).id)

    // Inactive so no real customer can use it; re-activated only for pricing below.
    await admin.from('vouchers').update({ is_active: true }).eq('id', voucherIds[0])

    const { createVoucherLookup } = await import('@/lib/vouchers/repository')
    const { priceOrderWithVouchers } = await import('@/lib/vouchers/order-pricing')
    const { vouchersForClient } = await import('@/lib/vouchers/client-features')
    const lookup = createVoucherLookup(admin)

    const found = await lookup.findByCodes(tenantId, [code])
    expect(found[0]?.maxDiscountedUnits).toBe(1)
    expect(vouchersForClient(found, false)).toEqual([])
    expect(vouchersForClient(found, true)).toHaveLength(1)

    const [cheap, dear] = items
    const priced = (unitPicks?: Record<string, Record<string, number>>) =>
      priceOrderWithVouchers({
        tenantId,
        items: [
          { menu_item_id: cheap.id, quantity: 5, subtotal: cheap.price * 5 },
          { menu_item_id: dear.id, quantity: 1, subtotal: dear.price },
        ],
        voucherCodes: [code],
        channel: 'checkout',
        now: new Date(),
        lookup,
        unitPicks,
      })

    const cheapest = await priced()
    expect(cheapest.totals.discountTotal).toBe(Math.round(cheap.price * 50) / 100)
    expect(cheapest.discountPayload?.lines[0].items).toEqual([
      { lineKey: 'line-0', units: 1, amount: Math.round(cheap.price * 50) / 100 },
    ])

    const chosen = await priced({ [code]: { 'line-1': 1 } })
    expect(chosen.totals.discountTotal).toBe(Math.round(dear.price * 50) / 100)
    expect(chosen.discountPayload?.allocationsByLine).toEqual({ 'line-1': Math.round(dear.price * 50) / 100 })

    await admin.from('vouchers').update({ is_active: false }).eq('id', voucherIds[0])
  })
})

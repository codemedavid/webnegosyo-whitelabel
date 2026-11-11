/**
 * @jest-environment node
 *
 * A write that changed zero rows is not always a refusal: deleting a row that
 * is already gone changes nothing and is fine. `assertRowsChangedOrGone` asks
 * whether the rows the write was aimed at are still there. Still there = the
 * database turned the write away; gone = there was nothing left to do.
 */
import { assertRowsChangedOrGone } from '@/platform/db/assert-rows-changed-or-gone'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

const DISHES = [
  { id: 'd1', tenant_id: 't1' },
  { id: 'd2', tenant_id: 't1' },
]

function deleteDish(client: ReturnType<typeof fakeSupabaseTables>['client'], id: string) {
  return async () =>
    assertRowsChangedOrGone(
      await client.from('menu_items').delete().eq('id', id).eq('tenant_id', 't1').select('id'),
      () => client.from('menu_items').select('id').eq('id', id).eq('tenant_id', 't1').limit(1),
    )
}

describe('assertRowsChangedOrGone', () => {
  it('passes when the write changed rows, without asking what is left', async () => {
    const fake = fakeSupabaseTables({ menu_items: DISHES })

    expect(await deleteDish(fake.client, 'd1')()).toEqual({ ok: true, count: 1, rows: [{ id: 'd1' }] })
    expect(fake.requests).toEqual([])
  })

  it('passes with a count of zero when the row is already gone: the second tap of a double tap', async () => {
    const fake = fakeSupabaseTables({ menu_items: DISHES })
    await deleteDish(fake.client, 'd1')()

    expect(await deleteDish(fake.client, 'd1')()).toEqual({ ok: true, count: 0, rows: [] })
  })

  it('fails as refused when zero rows changed and the row is still there: the shape of an RLS refusal', async () => {
    const fake = fakeSupabaseTables({ menu_items: DISHES }, {}, { refuseWrites: ['menu_items'] })

    expect(await deleteDish(fake.client, 'd1')()).toEqual({ ok: false, reason: 'refused' })
  })

  it('returns the write error as it is', async () => {
    const fake = fakeSupabaseTables({ menu_items: DISHES }, { menu_items: 'update or delete violates foreign key constraint' })

    expect(await deleteDish(fake.client, 'd1')()).toEqual({
      ok: false,
      reason: 'error',
      error: { message: 'update or delete violates foreign key constraint' },
    })
  })

  it('returns the error of the look for what is left, rather than guessing', async () => {
    const result = await assertRowsChangedOrGone({ data: [], error: null, status: 200 }, () =>
      Promise.resolve({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }),
    )

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      error: { message: 'canceling statement due to statement timeout', code: '57014' },
    })
  })

  it('fails a write that asked for neither rows nor a count, like assertRowsChanged', async () => {
    const remaining = jest.fn()

    expect(await assertRowsChangedOrGone({ error: null, status: 204 }, remaining)).toEqual({ ok: false, reason: 'not-counted' })
    expect(remaining).not.toHaveBeenCalled()
  })

  it("reads a { count: 'exact' } write the same way", async () => {
    const fake = fakeSupabaseTables({ menu_items: DISHES }, {}, { refuseWrites: ['menu_items'] })
    const remaining = () => fake.client.from('menu_items').select('id').eq('tenant_id', 't1').limit(1)

    const refused = await assertRowsChangedOrGone(
      await fake.client.from('menu_items').update({ is_available: false }, { count: 'exact' }).eq('tenant_id', 't1'),
      remaining,
    )
    const nothingThere = await assertRowsChangedOrGone(
      await fake.client.from('menu_items').update({ is_available: false }, { count: 'exact' }).eq('tenant_id', 'no-such-store'),
      () => fake.client.from('menu_items').select('id').eq('tenant_id', 'no-such-store').limit(1),
    )

    expect(refused).toEqual({ ok: false, reason: 'refused' })
    expect(nothingThere).toEqual({ ok: true, count: 0, rows: [] })
  })
})

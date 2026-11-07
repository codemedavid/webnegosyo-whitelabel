import {
  readItemCosts,
  readMovementCosts,
  withItemCosts,
  withMovementCosts,
  type CostReaderClient,
} from '@/lib/inventory/item-costs'

const TENANT = 'tenant-1'

function clientReturning(...answers: Array<{ data?: unknown; error?: { code?: string; message: string } | null }>) {
  const rpc = jest.fn()
  for (const answer of answers) rpc.mockResolvedValueOnce({ data: answer.data ?? null, error: answer.error ?? null })
  return { client: { rpc } as unknown as CostReaderClient, rpc }
}

const row = (id: string, cost: number | string | null) => ({ inventory_item_id: id, unit_cost: cost })
const NOT_ALLOWED = { code: '42501', message: 'Seeing what ingredients cost needs the Costs permission.' }

describe('readItemCosts', () => {
  it('maps ingredient id to price, coercing numerics', async () => {
    const { client, rpc } = clientReturning({ data: [row('a', '12.5'), row('b', 0)] })

    const costs = await readItemCosts(client, TENANT, ['a', 'b'])

    expect(costs?.get('a')).toBe(12.5)
    expect(costs?.get('b')).toBe(0)
    expect(rpc).toHaveBeenCalledWith('inventory_costs_for_tenant', { p_tenant_id: TENANT, p_item_ids: ['a', 'b'], p_after: null })
  })

  it('pages past the 1000-row API cap, resuming after the last id', async () => {
    const full = Array.from({ length: 1000 }, (_, index) => row(`id-${String(index).padStart(4, '0')}`, 1))
    const { client, rpc } = clientReturning({ data: full }, { data: [row('id-9999', 2)] })

    const costs = await readItemCosts(client, TENANT)

    expect(costs?.size).toBe(1001)
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_after: 'id-0999' })
  })

  it('answers null (not zero) to an account without costs', async () => {
    const { client } = clientReturning({ error: NOT_ALLOWED })
    await expect(readItemCosts(client, TENANT)).resolves.toBeNull()
  })

  it('throws on any other failure so a transport error never reads as a free ingredient', async () => {
    const { client } = clientReturning({ error: { code: '08006', message: 'connection lost' } })
    await expect(readItemCosts(client, TENANT)).rejects.toMatchObject({ code: '08006' })
  })
})

describe('withItemCosts', () => {
  const items = [{ id: 'a', name: 'Beef' }, { id: 'b', name: 'Salt' }] as unknown as Parameters<typeof withItemCosts>[2]

  it('fills the price for a costs holder', async () => {
    const { client } = clientReturning({ data: [row('a', 420)] })
    const result = await withItemCosts(client, TENANT, items)
    expect(result.map((item) => item.unit_cost)).toEqual([420, 0])
  })

  it('fills 0 for an account without costs (screens hide it; never a real figure)', async () => {
    const { client } = clientReturning({ error: NOT_ALLOWED })
    const result = await withItemCosts(client, TENANT, items)
    expect(result.map((item) => item.unit_cost)).toEqual([0, 0])
  })

  it('does not call the server for an empty list', async () => {
    const { client, rpc } = clientReturning()
    await expect(withItemCosts(client, TENANT, [])).resolves.toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('movement costs', () => {
  it('chunks 1000 ids per call and keeps unrecorded costs absent', async () => {
    const ids = Array.from({ length: 1500 }, (_, index) => `m-${index}`)
    const { client, rpc } = clientReturning(
      { data: [{ movement_id: 'm-0', unit_cost: '25' }] },
      { data: [{ movement_id: 'm-1200', unit_cost: null }] },
    )

    const costs = await readMovementCosts(client, TENANT, ids)

    expect(rpc).toHaveBeenCalledTimes(2)
    expect((rpc.mock.calls[0][1] as { p_movement_ids: string[] }).p_movement_ids).toHaveLength(1000)
    expect(costs?.get('m-0')).toBe(25)
    expect(costs?.has('m-1200')).toBe(false)
  })

  it('is null without costs, and rows then carry a null cost', async () => {
    const { client } = clientReturning({ error: NOT_ALLOWED })
    const rows = await withMovementCosts(client, TENANT, [{ id: 'm1' }] as unknown as Parameters<typeof withMovementCosts>[2])
    expect(rows[0].unit_cost).toBeNull()
  })
})

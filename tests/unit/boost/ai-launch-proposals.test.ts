/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BoostIdea } from '@/lib/boost/ideas'

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

const COMBO: BoostIdea = {
  kind: 'combo', id: 'combo:a:b', title: 'Adobo Meal', reason: 'r', itemIds: ['a', 'b'],
  name: 'Adobo Meal', picks: [{ label: 'Adobo', itemIds: ['a'] }, { label: 'Drink', itemIds: ['b'] }],
  regularPrice: 225, price: 209, savings: null,
}

interface Script {
  existing?: { id: string } | null
  insertGeneration?: { data: { id: string } | null; error: { code?: string; message: string } | null }
  /** What a re-read finds after a lost insert race. */
  winner?: { id: string } | null
  insertProposals?: { error: { message: string } | null }
  /** Proposals already stored under the existing generation (default: has some). */
  storedProposals?: number
}

function fakeClient(script: Script) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = []
  let reads = 0
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      Object.assign(builder, {
        select: chain, eq: chain,
        // `select('id', { count, head })` awaited directly: the stored proposal count.
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ count: script.storedProposals ?? 1, error: null }).then(resolve),
        maybeSingle: async () => {
          reads += 1
          return { data: reads === 1 ? script.existing ?? null : script.winner ?? null, error: null }
        },
        insert: (payload: unknown) => {
          calls.push({ table, op: 'insert', payload })
          if (table === 'boost_ai_proposals') return Promise.resolve(script.insertProposals ?? { error: null })
          return { select: () => ({ single: async () => script.insertGeneration ?? { data: { id: 'gen-1' }, error: null } }) }
        },
        delete: () => {
          calls.push({ table, op: 'delete' })
          return { eq: () => ({ eq: async () => ({ error: null }) }) }
        },
      })
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

async function load() {
  return import('@/lib/boost/ai/store')
}

describe('fileLaunchProposals', () => {
  it('files the combos as pending suggestions in a launch generation that never counts against the allowance', async () => {
    const { fileLaunchProposals } = await load()
    const { client, calls } = fakeClient({})

    const result = await fileLaunchProposals(client, 'tenant-1', [COMBO])

    expect(result).toEqual({ generationId: 'gen-1', isNew: true })
    const generation = calls.find((c) => c.table === 'boost_ai_generations' && c.op === 'insert')
    expect(generation?.payload).toMatchObject({ tenant_id: 'tenant-1', source: 'launch', status: 'succeeded', orders_analyzed: 0 })
    const proposals = calls.find((c) => c.table === 'boost_ai_proposals')?.payload as Array<Record<string, unknown>>
    expect(proposals).toEqual([{ generation_id: 'gen-1', tenant_id: 'tenant-1', kind: 'combo', position: 0, payload: COMBO }])
    // No status: the column default (pending) means it waits for approval.
    expect(proposals[0]).not.toHaveProperty('status')
  })

  it('files nothing a second time once the store has its launch suggestions', async () => {
    const { fileLaunchProposals } = await load()
    const { client, calls } = fakeClient({ existing: { id: 'gen-old' } })

    const result = await fileLaunchProposals(client, 'tenant-1', [COMBO])

    expect(result).toEqual({ generationId: 'gen-old', isNew: false })
    expect(calls).toEqual([])
  })

  it('fills in a launch generation left EMPTY by a process that died between the two inserts', async () => {
    const { fileLaunchProposals } = await load()
    const { client, calls } = fakeClient({ existing: { id: 'gen-orphan' }, storedProposals: 0 })

    const result = await fileLaunchProposals(client, 'tenant-1', [COMBO])

    expect(result).toEqual({ generationId: 'gen-orphan', isNew: true })
    const proposals = calls.find((c) => c.table === 'boost_ai_proposals')?.payload as Array<Record<string, unknown>>
    expect(proposals).toEqual([{ generation_id: 'gen-orphan', tenant_id: 'tenant-1', kind: 'combo', position: 0, payload: COMBO }])
    expect(calls.some((c) => c.op === 'delete')).toBe(false)
  })

  it('treats a lost race on the one-per-store index as already filed', async () => {
    const { fileLaunchProposals } = await load()
    const { client, calls } = fakeClient({
      insertGeneration: { data: null, error: { code: '23505', message: 'duplicate key' } },
      winner: { id: 'gen-winner' },
    })

    const result = await fileLaunchProposals(client, 'tenant-1', [COMBO])

    expect(result).toEqual({ generationId: 'gen-winner', isNew: false })
    expect(calls.some((c) => c.table === 'boost_ai_proposals')).toBe(false)
  })

  it('removes a half-written filing so a retry can file it again', async () => {
    const { fileLaunchProposals } = await load()
    const { client, calls } = fakeClient({ insertProposals: { error: { message: 'boom' } } })

    await expect(fileLaunchProposals(client, 'tenant-1', [COMBO])).rejects.toThrow(/boom/)
    expect(calls.some((c) => c.table === 'boost_ai_generations' && c.op === 'delete')).toBe(true)
  })
})

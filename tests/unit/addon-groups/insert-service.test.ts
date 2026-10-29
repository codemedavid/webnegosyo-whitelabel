import { describe, it, expect } from '@jest/globals'
import { insertLibraryGroupIntoDishes } from '@/lib/addon-groups/insert-service'
import type { ModifierGroupLibraryEntry } from '@/types/database'

/**
 * "Insert into dishes": one saved group onto many dishes in one go.
 *
 * Writes go through the caller's session client, so RLS decides; a refused
 * UPDATE comes back as zero rows with no error, so every write is checked by
 * the rows it returned. Nothing is written until every dish has been read and
 * planned, and only this tenant's rows are read or written.
 */

const libraryGroup: ModifierGroupLibraryEntry = {
  id: 'lib-1',
  tenant_id: 't1',
  name: 'Add-ons',
  selection_mode: 'quantity',
  min_select: 0,
  max_select: null,
  options: [{ id: 'x', name: 'Fried Rice', price_modifier: 15, display_order: 0 }],
  is_active: true,
  display_order: 0,
  created_at: '',
  updated_at: '',
}

interface Row extends Record<string, unknown> { id: string; tenant_id: string }

function fakeClient(tables: Record<string, Row[]>, refuseUpdateIds: string[] = []) {
  const writes: Array<{ id: string; patch: Record<string, unknown> }> = []
  const filtersSeen: string[] = []

  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    let patch: Record<string, unknown> | null = null
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: () => builder,
      update: (value: Record<string, unknown>) => {
        patch = value
        return builder
      },
      eq: (column: string, value: unknown) => {
        filtersSeen.push(`${table}.${column}`)
        rows = rows.filter((row) => row[column] === value)
        return builder
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]))
        return builder
      },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (patch) {
          const allowed = rows.filter((row) => !refuseUpdateIds.includes(row.id))
          allowed.forEach((row) => writes.push({ id: row.id, patch: patch as Record<string, unknown> }))
          return resolve({ data: allowed.map((row) => ({ id: row.id })), error: null })
        }
        return resolve({ data: rows, error: null })
      },
    })
    return builder
  }

  return { client: { from: query }, writes, filtersSeen }
}

const dish = (id: string, name: string, extra: Record<string, unknown> = {}): Row => ({
  id, tenant_id: 't1', name, modifier_groups: [], variation_types: [], variations: [], addons: [], ...extra,
})

let n = 0
const makeId = () => `new-${++n}`

describe('insertLibraryGroupIntoDishes', () => {
  it('adds the group to dishes without it and replaces it where asked', async () => {
    const { client, writes } = fakeClient({
      modifier_group_library: [libraryGroup as unknown as Row],
      menu_items: [
        dish('d1', 'Tapsilog'),
        dish('d2', 'Porksilog', { addons: [{ id: 'a', name: 'Fried Rice', price: 0 }] }),
      ],
    })

    const result = await insertLibraryGroupIntoDishes(client, 't1', { entryId: 'lib-1', itemIds: ['d1', 'd2'], onConflict: 'replace' }, makeId)

    expect(result).toMatchObject({ added: 1, replaced: 1, skipped: 0, failed: [] })
    expect([...result.updatedIds].sort()).toEqual(['d1', 'd2'])
    expect(writes.map((w) => w.id).sort()).toEqual(['d1', 'd2'])
    const porksilog = writes.find((w) => w.id === 'd2')?.patch as { addons: Array<{ price: number }> }
    expect(porksilog.addons.map((a) => a.price)).toEqual([15])
  })

  it('writes nothing for a dish it was told to skip', async () => {
    const { client, writes } = fakeClient({
      modifier_group_library: [libraryGroup as unknown as Row],
      menu_items: [dish('d2', 'Porksilog', { addons: [{ id: 'a', name: 'Fried Rice', price: 0 }] })],
    })

    const result = await insertLibraryGroupIntoDishes(client, 't1', { entryId: 'lib-1', itemIds: ['d2'], onConflict: 'skip' }, makeId)

    expect(result).toEqual({ added: 0, replaced: 0, skipped: 1, failed: [], updatedIds: [] })
    expect(writes).toEqual([])
  })

  it('reports a dish whose update came back with no rows', async () => {
    const { client } = fakeClient(
      { modifier_group_library: [libraryGroup as unknown as Row], menu_items: [dish('d1', 'Tapsilog')] },
      ['d1']
    )

    const result = await insertLibraryGroupIntoDishes(client, 't1', { entryId: 'lib-1', itemIds: ['d1'], onConflict: 'replace' }, makeId)

    expect(result).toEqual({ added: 0, replaced: 0, skipped: 0, failed: ['Tapsilog'], updatedIds: [] })
  })

  it('refuses before writing when a dish or the group is not this store’s', async () => {
    const { client, writes } = fakeClient({
      modifier_group_library: [libraryGroup as unknown as Row],
      menu_items: [dish('d1', 'Tapsilog'), { ...dish('other', 'Theirs'), tenant_id: 't2' }],
    })

    await expect(
      insertLibraryGroupIntoDishes(client, 't1', { entryId: 'lib-1', itemIds: ['d1', 'other'], onConflict: 'replace' }, makeId)
    ).rejects.toThrow(/not found/i)
    await expect(
      insertLibraryGroupIntoDishes(client, 't2', { entryId: 'lib-1', itemIds: ['other'], onConflict: 'replace' }, makeId)
    ).rejects.toThrow(/group/i)
    expect(writes).toEqual([])
  })

  it('refuses an empty or oversized request', async () => {
    const { client } = fakeClient({})
    await expect(insertLibraryGroupIntoDishes(client, 't1', { entryId: 'lib-1', itemIds: [], onConflict: 'replace' }, makeId)).rejects.toThrow()
    const many = Array.from({ length: 501 }, (_, i) => `d${i}`)
    await expect(insertLibraryGroupIntoDishes(client, 't1', { entryId: 'lib-1', itemIds: many, onConflict: 'replace' }, makeId)).rejects.toThrow()
  })
})

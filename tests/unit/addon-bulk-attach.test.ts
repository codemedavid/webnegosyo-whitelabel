/**
 * Attaching library add-ons to many menu items at once, from the MCP.
 *
 * Attaching is SNAPSHOT-ON-ATTACH: a {id, name, price} copy of the library
 * entry is written into `menu_items.addons`, so the cart/order runtime never
 * has to resolve a reference. The pure merge (`attachEntriesToAddons`) already
 * dedupes by name; this writer's job is to apply it across a set of items
 * without ever losing the add-ons an item already has.
 *
 * That last part is the real hazard. `updateMenuItemFields` REPLACES the addons
 * array, so a bulk attach that sends only the new entries silently deletes the
 * item's existing ones — a merchant's per-item extras gone in one tool call.
 */

import { attachAddonEntriesToItems } from '@/lib/addon-bulk-attach'

interface FakeItem {
  id: string
  addons: Array<{ id: string; name: string; price: number }>
}

/** Client answering item reads and recording the addon arrays written back. */
function fakeClient(items: FakeItem[], entries: Array<{ id: string; name: string; price: number }>) {
  const writes: Array<{ id: string; addons: Array<{ name: string; price: number }> }> = []

  const resolving = (rows: unknown[]) => {
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      in: () => b,
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
    })
    return b
  }

  return {
    writes,
    client: {
      from: (table: string) => ({
        select: () => resolving(table === 'menu_items' ? items : entries),
        update: (patch: { addons: Array<{ name: string; price: number }> }) => {
          const b: Record<string, unknown> = {}
          let id = ''
          Object.assign(b, {
            eq: (col: string, val: string) => {
              if (col === 'id') id = val
              return b
            },
            then: (resolve: (v: unknown) => unknown) => {
              writes.push({ id, addons: patch.addons })
              return resolve({ data: null, error: null })
            },
          })
          return b
        },
      }),
    },
  }
}

const ENTRIES = [
  { id: 'e1', name: 'Extra Shot', price: 30 },
  { id: 'e2', name: 'Oat Milk', price: 25 },
]

describe('attachAddonEntriesToItems', () => {
  it('adds the library add-ons to every listed item', async () => {
    // Arrange
    const { client, writes } = fakeClient(
      [{ id: 'i1', addons: [] }, { id: 'i2', addons: [] }],
      ENTRIES,
    )

    // Act
    await attachAddonEntriesToItems('t1', ['i1', 'i2'], ['e1', 'e2'], { client: client as never })

    // Assert
    expect(writes).toHaveLength(2)
    expect(writes[0].addons.map((a) => a.name)).toEqual(['Extra Shot', 'Oat Milk'])
  })

  it('KEEPS the add-ons an item already had', async () => {
    // updateMenuItemFields replaces the array wholesale; sending only the new
    // entries would wipe a merchant's per-item extras.
    const { client, writes } = fakeClient(
      [{ id: 'i1', addons: [{ id: 'old', name: 'Whipped Cream', price: 20 }] }],
      ENTRIES,
    )

    await attachAddonEntriesToItems('t1', ['i1'], ['e1'], { client: client as never })

    expect(writes[0].addons.map((a) => a.name)).toEqual(['Whipped Cream', 'Extra Shot'])
  })

  it('is idempotent — attaching the same entry twice does not duplicate it', async () => {
    const { client, writes } = fakeClient(
      [{ id: 'i1', addons: [{ id: 'x', name: 'Extra Shot', price: 30 }] }],
      ENTRIES,
    )

    await attachAddonEntriesToItems('t1', ['i1'], ['e1'], { client: client as never })

    expect(writes[0].addons.filter((a) => a.name === 'Extra Shot')).toHaveLength(1)
  })

  it('reports how many items it changed', async () => {
    const { client } = fakeClient([{ id: 'i1', addons: [] }], ENTRIES)

    const result = await attachAddonEntriesToItems('t1', ['i1'], ['e1'], { client: client as never })

    expect(result).toMatchObject({ itemsUpdated: 1 })
  })

  it('refuses when an entry id is not in this tenant\'s library', async () => {
    const { client, writes } = fakeClient([{ id: 'i1', addons: [] }], [ENTRIES[0]])

    await expect(
      attachAddonEntriesToItems('t1', ['i1'], ['e1', 'missing'], { client: client as never }),
    ).rejects.toThrow(/library|not found|unknown/i)
    expect(writes).toEqual([])
  })

  it('refuses when an item id is not this tenant\'s', async () => {
    const { client, writes } = fakeClient([{ id: 'i1', addons: [] }], ENTRIES)

    await expect(
      attachAddonEntriesToItems('t1', ['i1', 'ghost'], ['e1'], { client: client as never }),
    ).rejects.toThrow(/item|not found|unknown/i)
    expect(writes).toEqual([])
  })

  it('refuses an empty request rather than reporting a no-op as success', async () => {
    const { client } = fakeClient([], ENTRIES)

    await expect(attachAddonEntriesToItems('t1', [], ['e1'], { client: client as never })).rejects.toThrow()
    await expect(attachAddonEntriesToItems('t1', ['i1'], [], { client: client as never })).rejects.toThrow()
  })
})
